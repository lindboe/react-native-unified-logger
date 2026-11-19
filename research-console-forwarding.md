# How React Native 0.88 forwards JS `console.*` to native logs

Source: local checkout of `facebook/react-native` `main` at commit `de350e65e1` (2026-09-24). All paths are relative to the repo root; `RN/` = `packages/react-native/`. Findings come from reading source only. Statements about Apple/Android OS log-viewer behavior that are not in this repo are marked as such.

## 1. The `console` polyfill and JS level mapping

The polyfill is `packages/polyfills/console.js` (published as `@react-native/js-polyfills`; there is no `RN/Libraries/polyfills/` anymore). It is injected by Metro as a prelude polyfill in every build (dev and release): `packages/polyfills/index.js:13-16` returns `console.js` and `error-guard.js`, and `packages/metro-config/src/index.flow.js:66` sets `serializer.getPolyfills: () => require('@react-native/js-polyfills')()`.

`nativeLoggingHook` is a JSI host function installed by C++ before the bundle runs: `RN/ReactCommon/jsitooling/react/runtime/JSRuntimeBindings.cpp:14-35` (`bindNativeLogger`). It takes exactly 2 args `(message: string, level: number)` and calls a `Logger(const std::string&, unsigned int)`. Callers:

- iOS bridgeless: `RN/ReactCommon/react/runtime/platform/ios/ReactCommon/RCTInstance.mm:406-408`
- Android bridgeless: `RN/ReactAndroid/src/main/jni/react/runtime/jni/JReactInstance.cpp:75-79`
- Android legacy Hermes executor (deprecated): `RN/ReactAndroid/src/main/jni/react/hermes/reactexecutor/OnLoad.cpp:43-45`
- C++-only platform host: `RN/ReactCxxPlatform/react/runtime/ReactHost.cpp:288`

None of these are behind `#if DEBUG` / `__DEV__`.

Level constants, `packages/polyfills/console.js:385-390`:

```js
const LOG_LEVELS = { trace: 0, info: 1, warn: 2, error: 3 };
```

Method assignment, `console.js:579-607` (only when `global.nativeLoggingHook` exists):

| JS method | numeric level passed to `nativeLoggingHook` |
|---|---|
| `console.debug` | 0 (trace) |
| `console.trace` | 0 (trace); prints the message only, no stack trace |
| `console.log` | 1 (info) |
| `console.info` | 1 (info) |
| `console.warn` | 2 (warn) |
| `console.error` | 3 (error), except a first argument starting with `"Warning: "` is downgraded to 2 (`console.js:412-423`) |
| `console.table`, `group`, `groupCollapsed`, `groupEnd` | 1 (info) (`console.js:537, 552-563`) |
| `console.assert` (failed) | 3 (error) (`console.js:566-569`) |
| `time`, `timeEnd`, `timeStamp`, `count`, `countReset` | stubs unless the pre-existing runtime console provides them (`console.js:589-596`) |

Formatting (`console.js:392-428`): a single string argument is passed as-is; otherwise every argument goes through the polyfill's `inspect(arg, {depth: 10})` and the results are joined with `", "`. Group nesting adds indentation via `groupFormat`.

Other details in the polyfill:

- In `__DEV__`, the previous runtime `console` is preserved as `global.originalConsole` (`console.js:580-587`), and each polyfilled method first calls `originalConsole[method]` and then the native-hook method (`console.js:659-683`). This is what feeds DevTools (see section 4). In release, only the native-hook path runs.
- If `global.RN$useAlwaysAvailableJSErrorHandling === true`, `console.error` additionally reports to `RN$handleException` (`console.js:612-650`); it still calls the native hook first.
- If there is no `nativeLoggingHook`, it falls back to `global.print` (`console.js:684-719`).

## 2. iOS

### Path

`console.*` -> `nativeLoggingHook` -> lambda in `RCTInstance.mm:406-408`:

```objc
facebook::react::bindNativeLogger(runtime, [](const std::string &message, unsigned int logLevel) {
  _RCTLogJavaScriptInternal(static_cast<RCTLogLevel>(logLevel), [NSString stringWithUTF8String:message.c_str()]);
});
```

The JS number is cast 1:1 to `RCTLogLevel` (`RN/React/Base/RCTLog.h:43-49`: Trace=0, Info=1, Warning=2, Error=3, Fatal=4).

`_RCTLogJavaScriptInternal` (`RN/React/Base/RCTLog.mm:328-337`):

```objc
RCTLogFunction logFunction = RCTGetLocalLogFunction();
BOOL log = RCT_DEBUG || (logFunction != nil);
if (log && level >= RCTGetLogThreshold()) {
  if (logFunction) { logFunction(level, RCTLogSourceJavaScript, nil, nil, message); }
}
```

`RCTGetLocalLogFunction` returns a thread-local override or `RCTGetLogFunction()` (`RCTLog.mm:147-156`), which lazily defaults to `RCTDefaultLogFunction` (`RCTLog.mm:121-127`), so `logFunction` is never nil and the `RCT_DEBUG` term is irrelevant: forwarding happens in Release too. JS messages do not go to RedBox or back to JS (only `_RCTLogNativeInternal` does that, `RCTLog.mm:252-326`).

### Sink: `os_log`, not `NSLog`

`RCTDefaultLogFunction` (`RCTLog.mm:107-114`):

```objc
os_log_with_type(RCTLogForLogSource(source), RCTLogTypeForLogLevel(level), "%{public}s", message.UTF8String);
```

- Subsystem `com.facebook.react.log`, category `javascript` for JS logs and `native` for `RCTLog*` macros (`RCTLog.mm:85-105`).
- Message format is `%{public}s`, so it is not redacted as `<private>` in Release.
- Level to `os_log_type_t` (`RCTLog.mm:74-83`):

| JS method | RCTLogLevel | os_log type |
|---|---|---|
| `debug`, `trace` | Trace (0) | `OS_LOG_TYPE_DEBUG` |
| `log`, `info` | Info (1) | `OS_LOG_TYPE_INFO` |
| `warn` | Warning (2) | `OS_LOG_TYPE_INFO` |
| `error` | Error (3) | `OS_LOG_TYPE_ERROR` |

Warnings map to INFO, not DEFAULT. No JS level maps to `OS_LOG_TYPE_DEFAULT` or `OS_LOG_TYPE_FAULT`. An app can replace the sink via `RCTSetLogFunction` / `RCTAddLogFunction` (`RCTLog.h:103-111`); no production code in the repo does so (only rn-tester tests).

### Threshold

`RCTLog.mm:32-36`:

```objc
/* os log will discard debug and info messages if they are not needed */
static const RCTLogLevel RCTDefaultLogThreshold = (RCTLogLevel)(RCTLogLevelInfo - 1);
static RCTLogLevel RCTCurrentLogThreshold = RCTDefaultLogThreshold;
```

`RCTLogLevelInfo - 1` = `RCTLogLevelTrace` (0), the same in Debug and Release (no `#if`). The header comment at `RCTLog.h:90-94` ("Default is RCTLogLevelInfo for debug and RCTLogLevelError for production") is stale. No RN code calls `RCTSetLogThreshold` outside tests. **RN drops no JS console level in either configuration.** Filtering is left to the unified logging system.

### Is `console.debug` visible?

- RN emits it in both Debug and Release as `OS_LOG_TYPE_DEBUG` on `com.facebook.react.log`/`javascript`.
- Whether you see it depends on Apple's logging system, not this repo. Per Apple's documented `os_log` behavior (not verifiable from this source): debug-type messages are not persisted by default, Console.app shows them only with Action > Include Debug Messages enabled while streaming, and `log stream --level debug` shows them. The Xcode debug console shows os_log messages, including debug type, from a process it launched. Could not determine from source whether a given Xcode version filters them by default.
- `log`/`info`/`warn` (INFO type) are similar: by default they are held in memory only and Console.app needs "Include Info Messages". Only `console.error` (ERROR type) is persisted by default.

## 3. Android

`console.*` -> `nativeLoggingHook` -> `reactAndroidLoggingHook` (`RN/ReactAndroid/src/main/jni/react/jni/JSLogging.cpp:14-20`):

```cpp
auto logPriority = static_cast<android_LogPriority>(logLevel + ANDROID_LOG_DEBUG);
__android_log_write(logPriority, "ReactNativeJS", message.c_str());
```

Written directly from C++ to logcat. There is no Java/Kotlin hop (no `JavaScriptLogger` class). Tag is `ReactNativeJS`. With `ANDROID_LOG_DEBUG` = 3:

| JS method | JS level | logcat priority |
|---|---|---|
| `debug`, `trace` | 0 | D |
| `log`, `info` | 1 | I |
| `warn` | 2 | W |
| `error` | 3 | E |

Nothing maps to V. No build-type check exists, so it is active in release builds (R8/ProGuard `Log` stripping rules do not apply because this is NDK `__android_log_write`). Wired in `JReactInstance.cpp:75-79` for bridgeless and `hermes/reactexecutor/OnLoad.cpp:43-45` for the deprecated bridge.

## 4. Metro terminal and DevTools (dev only)

Both are separate from `nativeLoggingHook`.

**Metro terminal (legacy, off by default).** `RN/Libraries/Core/setUpDeveloperTools.js:19-45` wraps `trace, info, warn, error, log, group, groupCollapsed, groupEnd, debug` in `__DEV__` when `console._isPolyfilled`. Each wrapper calls `HMRClient.log(level, args)` and then the existing method. `HMRClient.log` (`RN/Libraries/Utilities/HMRClient.js:116-140`) sends `{type: 'log', level, data}` over the HMR WebSocket and buffers up to 100 early logs. Metro only prints them if `forwardClientLogs` is on, and the community CLI turns it off unless `--client-logs` is passed: `packages/community-cli-plugin/src/dev-server/runDevServer.js:98-102` and `src/commands/start.js:95-101` (marked "[Deprecated]", default `false`; TODO T214991636 removes it).

**DevTools (React Native DevTools / Fusebox).** `RN/ReactCommon/jsinspector-modern/RuntimeTargetConsole.cpp:604+` (`RuntimeTarget::installConsoleHandler`, called from `RuntimeTarget.cpp:42` when the runtime is registered with the inspector, `RN/ReactCommon/react/runtime/ReactInstance.cpp:113-150`) replaces the runtime's `console` with host functions that emit CDP `Runtime.consoleAPICalled` and then call the original Hermes console. This runs before the bundle, so the JS polyfill captures it as `originalConsole`, and in `__DEV__` calls it before the native hook (`console.js:659-671`). Inspector registration is enabled when `REACT_NATIVE_DEBUGGER_ENABLED` is defined, or in release only when `fuseboxEnabledRelease` is set (`RN/ReactCommon/jsinspector-modern/InspectorFlags.cpp:69-73`). The polyfill's `originalConsole` passthrough is `__DEV__`-only regardless.

## 5. Other DEV wrappers and their effect on the native hook

Wrap order: the polyfill (prelude), then `InitializeCore` -> `setUpErrorHandling` -> `setUpDeveloperTools` -> LogBox install. Each outer wrapper calls the inner one, so the native hook still receives every call except as noted below.

- **ExceptionsManager** (`RN/Libraries/Core/ExceptionsManager.js:182-281`, installed in all builds by `setUpErrorHandling.js:20`). It replaces `console.error`, calls `console._errorOriginal(...args)` first (so the native hook always gets it), then reports it as a soft exception (RedBox/LogBox in dev) unless `console.reportErrorsAsExceptions === false` or the message starts with `"Warning: "`. Uncaught JS exceptions with `reportToConsole` call `console.error(e)` (`ExceptionsManager.js:104-109`), so they also reach the native hook at level 3.
- **LogBox** (`RN/Libraries/LogBox/LogBox.js:66-146, 241-268`, `__DEV__` only). It wraps only `console.warn`. `registerWarning` calls the original `console.warn` (native hook) before applying LogBox ignore rules, so `LogBox.ignoreLogs` does not suppress native output. Exception: a message that `LogBoxData.isLogBoxErrorMessage` identifies as LogBox's own error is swallowed and never reaches the native hook (`LogBox.js:242-244`).
- **setUpDeveloperTools / HMRClient**: adds Metro forwarding only and does not change what reaches the hook (section 4).
- **`RCTLog.js`** (`RN/Libraries/Utilities/RCTLog.js:25-53`) handles native-to-JS log echo (`logIfNoNativeHook`) and forwards native `RCTLogWarn` to LogBox. It is not on the JS-to-native path.
- No wrapper changes the numeric level, other than the `"Warning: "` error-to-warn downgrade in the polyfill.

## 6. Other iOS native logging conventions

- `RCTLog*` macros (`RCTLog.h:33-38`) -> `_RCTLogNativeInternal` -> the same `RCTDefaultLogFunction`, using `os_log` subsystem `com.facebook.react.log`, category `native`. Unlike JS logs, native logs at Error or above also show a RedBox when it is enabled, and in `RCT_DEBUG` builds they are echoed to JS via `RCTLog.logIfNoNativeHook` (`RCTLog.mm:252-326`). `RCTLOG_ENABLED` (default 1, `RCTLog.h:17-19`) compiles out the native macros only, not the JS path.
- The only other `os_log_create` in RN is for tracing signposts: `RN/ReactCommon/cxxreact/TraceSection.h:135-142`, `os_log_create("dev.reactnative.instruments", OS_LOG_CATEGORY_DYNAMIC_TRACING)`, used with `os_signpost_interval_*`. It is not a text log.
- C++ `react_native_log_*` (`RN/ReactCommon/logger/react_native_log.cpp:29-51`) defaults to glog `LOG(INFO/WARNING/ERROR/FATAL)` unless `set_react_native_logfunc` is called. No iOS code in the repo calls it. Other C++ code uses glog `LOG(...)` directly (for example `cxxreact/NativeToJsBridge.cpp`).
- No `folly` logging with an os_log subsystem was found. Some `.mm` files still use plain `NSLog` (for example `RN/Libraries/AppDelegate/RCTReactNativeFactory.mm`, `RN/React/Base/RCTBundleURLProvider.mm`, `RN/React/CoreModules/RCTDevLoadingView.mm`).
- To match RN conventions, use subsystem `com.facebook.react.log` with category `javascript`/`native`, or your own subsystem, with `%{public}s`.

## Android native logging conventions

- Java/Kotlin: mostly `com.facebook.common.logging.FLog` (about 99 files reference `FLog`; only 2 import `android.util.Log` directly). The common tag is `ReactConstants.TAG = "ReactNative"` (`RN/ReactAndroid/src/main/java/com/facebook/react/common/ReactConstants.kt:12`, about 142 uses), and some classes use their class name as the tag.
- JS console: tag `ReactNativeJS` (section 3).
