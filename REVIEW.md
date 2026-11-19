# Independent review: react-native-unified-logger and LoggerDemo

Reviewed 2026-11-15 against the files in this workspace, the installed `react-native@0.88.1` / `@react-native/codegen` under `node_modules`, the generated codegen output (`example/ios/build/generated/ios/ReactCodegen/RNUnifiedLoggerSpec/`, `react-native-unified-logger/android/build/generated/source/codegen/java/`), the CocoaPods output under `example/ios/Pods/`, and the authoring session's transcript, scratchpad scripts, and background task outputs. No workspace file other than this one was modified.

## Summary verdict

The library is a reasonable, compact first version. The Turbo Module spec and the iOS/Android implementations match the generated codegen signatures for RN 0.88.1, and the core routing works on both platforms: native tags and levels, the callback, all four `localDestination` values, `minLevel`, and startup buffering. The session logs back that up. The JS layer is clean and its unit tests pass.

It is not publish-ready yet. The main problems:

1. With the default destination, `log.error` goes through `console.error`. React Native then turns every call into a LogBox error in dev and a `NativeExceptionsManager.reportException` soft exception in Release.
2. The podspec overwrites the `pod_target_xcconfig` that `install_modules_dependencies` just built. The builds only pass because the Podfile's `react_native_post_install` sets C++20 again.
3. iOS registration depends on `RCT_EXPORT_MODULE`'s `+load` path. Codegen's `ios.modulesProvider` would be the safer route; the `+load` path is compiled out when an app opts into `RCT_REMOVE_LEGACY_MODULE_INTEROP`.
4. Buffering behaves differently after a JS reload than after a cold start, and the iOS reload test output already shows the gap.
5. The library ships no Jest mock. Any consumer test that imports it throws, including the demo's own `App.test.tsx`.
6. Several README statements are inaccurate or incomplete.

The verification claims hold up overall: every claimed command was run, and the outputs show what is claimed. Some claims are worded more strongly than the evidence supports; details are in the verification audit below.

## Bugs (severity-ranked)

### B1. Medium-high: the default destination turns `log.error` into soft exceptions and LogBox errors

- **Where:** `react-native-unified-logger/src/index.ts:124-126` (`writeToConsole` → `console.error`). The same applies to native entries under `js` (`index.ts:170-172`) and to the callback-failure path (`index.ts:137`).
- **What's wrong:** RN installs `reactConsoleErrorHandler` over `console.error` in all builds (`node_modules/react-native/Libraries/Core/ExceptionsManager.js:182-268, 274-282`). In `__DEV__` each call adds a LogBox error. In Release, `reportException` calls `NativeExceptionsManager.reportException(data)` with `isFatal: false` (`ExceptionsManager.js:121-133`). So with the default `platformSpecific` (or `js`), every `log.error(...)` becomes a soft-exception report. Crash reporters that hook ExceptionsManager will count each one, and in dev each one interrupts with LogBox. `log.warn` also adds LogBox warnings in dev. The README describes this path only as "Written to the JS console".
- **Fix:** In `writeToConsole`, call `console._errorOriginal` when it exists for `error` (and optionally route `warn` around LogBox), or document the behavior prominently and offer an option. At a minimum, document `console.reportErrorsAsExceptions`.

### B2. Medium: the podspec clobbers `install_modules_dependencies`' xcconfig

- **Where:** `react-native-unified-logger/RNUnifiedLogger.podspec:24-27`.
- **What's wrong:** `install_modules_dependencies(s)` reads `spec.to_hash["pod_target_xcconfig"]` and writes back a merged hash with `HEADER_SEARCH_PATHS`, `CLANG_CXX_LANGUAGE_STANDARD = c++20`, `OTHER_CPLUSPLUSFLAGS -DRCT_NEW_ARCH_ENABLED=1` and `OTHER_SWIFT_FLAGS` (`node_modules/react-native/scripts/cocoapods/new_architecture.rb:75-120`). Line 27 then assigns `s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }`, which drops all of it. The proof is in `example/ios/Pods/Target Support Files/RNUnifiedLogger/RNUnifiedLogger.debug.xcconfig`: it has no `CLANG_CXX_LANGUAGE_STANDARD`, no `-DRCT_NEW_ARCH_ENABLED=1` in `OTHER_CPLUSPLUSFLAGS`, and no `Headers/Private/Yoga` path. `react-native-safe-area-context`'s xcconfig in the same Pods tree has all three. Builds pass only because `react_native_post_install` → `set_clang_cxx_language_standard_if_needed` forces c++20 on every pod target (`new_architecture.rb:18-45`). The comment at lines 22-23 claims the opposite of what happens. Under `use_frameworks!` the framework header search paths are also lost; the static-frameworks build happened to succeed anyway.
- **Fix:** Set `s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }` before calling `install_modules_dependencies(s)`, or merge into the existing hash.

### B3. Medium: iOS module registration depends on legacy `+load` registration

- **Where:** `ios/RNUnifiedLoggerModule.mm:13` (`RCT_EXPORT_MODULE(UnifiedLogger)`); `package.json:66-73` (`codegenConfig` has no `ios.modulesProvider`).
- **What's wrong:** The generated `RCTModuleProviders.mm` maps nothing (`moduleMapping = @{ }`), so the Turbo Module manager finds the class only through `RCTRegisterModule` in `+load`. When an app sets both `RCT_REMOVE_LEGACY_MODULE_INTEROP` and `RCT_REMOVE_LEGACY_COMPONENT_INTEROP` (opt-in via env at pod install, `scripts/react_native_pods.rb:123`), `RCT_EXPORT_MODULE` compiles to just `+moduleName` (`React/Base/RCTBridgeModule.h:72-80`). The module is then never found and `TurboModuleRegistry.getEnforcing('UnifiedLogger')` throws at import.
- **Fix:** Add `"ios": { "modulesProvider": { "UnifiedLogger": "RNUnifiedLoggerModule" } }` to `codegenConfig`, matching current create-react-native-library output, and keep `RCT_EXPORT_MODULE` for the module name.

### B4. Medium: native entries are dropped after a JS reload, unlike at cold start

- **Where:** `src/index.ts:277` (import-time `syncNative()`), `ios/RNUnifiedLoggerCore.mm:88-107, 137-147`, `android/.../UnifiedLoggerCore.kt:52-61, 75-78`.
- **What's wrong:** At cold start, entries are retained (`!_everForwarded`) until the app enables a callback, even if that happens long after JS starts. After a reload, `_everForwarded`/`everForwarded` is already true. The new runtime's import-time `configure({forwardToJs:false})` turns forwarding off, so every native entry logged between module import and the app's `configureLogger({callback})` is dropped from the callback. In a typical app the window is short (import → configure call). In apps that enable the callback later (after login or remote config, which is the README's own motivating example at line 179), every native entry until then is lost after a reload but kept after a cold start.
- **Evidence:** iOS reload attempts (session tool calls 171, 173, 175) show `didEnterBackground`/`didBecomeActive` logged after `App mounted` in the new runtime, and `received: []` after re-enabling the callback. DEV_REPORT presents this as "the reload window could not be exercised". The window itself was not hit, but the output does show this gap.
- **Fix:** Don't let the import-time default configure count as an app decision. Options: have the import-time call skip `configure` (or send a "not yet configured" flag) so native keeps treating the runtime as unconfigured until the first explicit `configureLogger`/`resetLogger`, or reset `everForwarded` on `registerSink`/`attach`. Document whichever rule results.

### B5. Medium: startup and pre-`configureLogger` native entries go to os_log/logcat even when the app will configure callback-only

- **Where:** native defaults `_logLocally = YES` (`RNUnifiedLoggerCore.mm:63`, `UnifiedLoggerCore.kt:32`), plus the import-time `syncNative()` with `platformSpecific` (`index.ts:277`).
- **What's wrong:** Requirement 4 says that with a callback, entries by default go only to the callback. Everything logged natively before JS loads, and between import and `configureLogger`, is written locally anyway. Native has no way to know the eventual setting. The buffered copies are then also delivered to the callback, so these entries end up in both places. The README never mentions this; line 306 says local output "is written immediately when local logging is enabled", which implies it follows the setting.
- **Fix:** Document it, or add a native pre-start option (for example `UnifiedLogger.setStartupLocalLogging(false)` / an Info.plist or manifest meta-data key) and let the import-time call avoid changing `logLocally`.

### B6. Medium (packaging/DX): no Jest mock; importing the library in Jest throws

- **Where:** `src/NativeUnifiedLogger.ts:37` (`getEnforcing`) runs at import, and `index.ts:277` calls into the module at import.
- **Reproduce:** `cd example && ../node_modules/.bin/jest` → `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'UnifiedLogger' could not be found` from `__tests__/App.test.tsx`. The demo's own `npm test` is broken, and every consumer's component tests will be too.
- **Fix:** Ship a mock (for example `react-native-unified-logger/jest/mock.js`, added to `files`) and document `jest.mock('react-native-unified-logger', () => require('react-native-unified-logger/jest/mock'))`. Alternatively, use `TurboModuleRegistry.get` and degrade to console-only output when the module is absent.

### B7. Low-medium: the default configuration retains native entries indefinitely

- **Where:** `RNUnifiedLoggerCore.mm:88-106`, `UnifiedLoggerCore.kt:55-60`.
- **What's wrong:** Apps that never set a callback (the default) keep `_everForwarded == NO` forever. Every native log call allocates an entry (`NSDictionary` + `NSDate`/`NSNumber`s on iOS, `Entry` on Android) and appends it to the 500-entry ring under the lock, for the life of the process. Messages can be stack traces, so this pins up to 500 arbitrarily large strings. If a callback is enabled hours later, it first receives up to 500 stale entries that were already written locally. The README's "startup logs" framing (line 179) undersells this.
- **Fix:** Bound retention by time or by "until first configure from the app" (see B4). Expose a native or JS option to disable pre-callback retention. Skip building the entry when `logLocally` is the only consumer and retention is off.

### B8. Low-medium: Android logs to logcat and builds `WritableNativeMap` while holding the global lock

- **Where:** `UnifiedLoggerCore.kt:48-62` (`writeToPlatformLog` at line 50, `toWritableMap`/`emit` at line 54), `configure` flush at line 77.
- **What's wrong:** `Log.*` is a socket write to `logd`, and `Arguments.createMap()` crosses JNI. Both happen inside `synchronized(lock)`, so all logging threads serialize on I/O. iOS deliberately avoids this ("Never held while calling os_log", `RNUnifiedLoggerCore.mm:29`). The two platforms are inconsistent, and Android scales worse under concurrent logging.
- **Fix:** Snapshot the settings under the lock, decide whether to emit or buffer, then call `Log.*` outside the lock, as iOS does. Ordered emission can keep a small critical section around `emit` only.

### B9. Low: Java callers passing `null` crash

- **Where:** `android/.../UnifiedLogger.kt:31-69`. Public Kotlin `String` parameters generate `checkNotNullParameter`.
- **What's wrong:** `UnifiedLogger.e("Tag", maybeNullMessage)` from Java throws `NullPointerException` inside the logger. iOS substitutes `@""` for nil (`RNUnifiedLoggerCore.mm:77-78`). A logging call should never crash the caller.
- **Fix:** Declare `message: String?` (and maybe `tag: String?`) and coerce with `?: ""` / `?: "null"`.

### B10. Low: level clamping is inconsistent across layers

- Android `configure` stores `min = config.getDouble("minLevel").toInt()` unclamped (`UnifiedLoggerModule.kt:31`, `UnifiedLoggerCore.kt:70`). iOS clamps (`RNUnifiedLoggerCore.mm:134`). A value above 3 drops all Android native entries but keeps errors on iOS.
- iOS `RNULevelFromJS` (`RNUnifiedLoggerModule.mm:6-9`) casts a finite but huge double to `NSInteger` before clamping, which is undefined behavior in C. Clamp in the double domain first.
- JS `levelFromNumber(NaN)` (`index.ts:87-89`) returns `undefined` cast as `LogLevel`. The callback then gets `level: undefined` and `writeToConsole` prints nothing.

The JS side only ever sends 0..3, so these are hardening fixes, not live bugs.

### B11. Low: `handleNativeEntry` does not re-check `minLevel`

- **Where:** `index.ts:161-173`.
- **What's wrong:** Native `configure` is asynchronous (void Turbo Module methods are dispatched to the method queue: `RCTTurboModuleManager.mm:114-125` on iOS, the native-modules thread on Android). Entries emitted before the new `minLevel` lands still reach the callback after JS has raised `minLevel`.
- **Fix:** Add `if (LEVEL_INDEX[entry.level] < LEVEL_INDEX[state.minLevel]) return;`.

### B12. Low: reentrancy and multiple instances on iOS

- `emitOnLog` runs under `os_unfair_lock` (`RNUnifiedLoggerCore.mm:97-101, 139-141`). `os_unfair_lock` is non-recursive and aborts on recursive acquisition. If an app routes `RCTSetLogFunction` into `UnifiedLogger` (a plausible integration) and anything on the emit path calls `RCTLog*`, the process crashes. Android's `synchronized` is reentrant, so the platforms differ here too.
- The core is a process-wide singleton with a single `_sink`/`moduleRef`. With two React Native hosts (brownfield), the most recently created module takes all forwarding, and either runtime's `configure` overrides the other's settings. Document this or key the state per host.

## Best-practice and design issues

- **os_log privacy.** Everything is logged `%{public}@` (`RNUnifiedLoggerCore.mm:111, 121`), so PII in log messages lands unredacted in sysdiagnoses and device logs. That matches RN's own `%{public}s`, but the README presents it only as a convenience (line 203). Add a privacy warning, and consider an option to log as private in Release.
- **Unbounded `os_log_t` cache.** `_logsByTag` (`RNUnifiedLoggerCore.mm:181-189`) grows with every distinct tag. `os_log_t` objects are never freed anyway, but dynamic tags (for example per-request) leak. Document "tags should be a small fixed set".
- **Level mapping.** warn → `OS_LOG_TYPE_DEFAULT` and the Android D/I/W/E mapping are sensible. There is no fault or assert level and no verbose level; that is acceptable but worth a sentence.
- **The API is not quite "the same way" everywhere.** JS uses `log.info(msg, ...rest)` with a bound tag, Swift uses `UnifiedLogger.info(tag:message:)`, and Kotlin uses `UnifiedLogger.i(tag, message)`. Kotlin lacks `debug/info/warn/error` aliases, and neither native side has a tag-bound logger object like `createLogger`. Consider `UnifiedLogger.debug/info/warn/error` on Android and a `UnifiedLogger(tag:)` instance type on both platforms.
- **Asymmetric retention.** Native entries logged before the callback are retained and replayed. JS entries logged before the callback are not (the Android Release screenshot shows JS info/warn from before "callback: ON" missing, while startup Kotlin entries are present). The callback therefore sees a different history per layer. Document it, or offer a JS-side buffer as well.
- **Cross-layer ordering is not preserved.** JS entries reach the callback synchronously, while native entries arrive asynchronously through the call invoker. Timestamps are present; say so in the README for remote-logging users.
- **No batching.** Each native entry is a separate `AsyncEventEmitter::emit` → `invokeAsync` hop. Under bursty native logging this floods the JS thread. Batching (`emitOnLog` with an array) would scale better.
- **Import-time side effect.** `index.ts:277` calls native at import, which causes B4, B5 and B6. Prefer a lazy first configure, or a flag that tells native "defaults, not an app decision".
- **The `native` destination decision is sound.** I checked `research-console-forwarding.md` against installed RN 0.88.1. `RCTLog.mm:74-83` maps warn to `OS_LOG_TYPE_INFO`; `RCTLog.mm:328-337` and the default log function run in Release; `JSLogging.cpp:18-19` writes to `ReactNativeJS`; console arguments are joined with `", "` via `inspect` (`@react-native/js-polyfills/console.js:392-403`). RN's mirroring loses the tag and maps warn to INFO, so `native` adds real value: per-tag filtering and DEFAULT for warn. The costs are that `native` entries disappear from Metro and DevTools, and that they take an async Turbo Module hop, so ordering against plain `console.*` lines is not guaranteed. Both should be documented.
- **Android Gradle.** `ndkVersion` (`android/build.gradle:34`), `buildConfig true` (`:41-43`) and the explicit `kotlin-stdlib` dependency (`:81`) are unnecessary for a pure-Kotlin library; `ndkVersion` can force an NDK download in hosts that don't define it. Applying `kotlin-android` (`:21`) requires hosts to keep `android.builtInKotlin=false` under AGP 9. That is fine for the 0.88 template, which sets it, but should be noted for hosts migrating to built-in Kotlin.
- **Public `emit`.** `UnifiedLoggerModule.emit` (`UnifiedLoggerModule.kt:43-45`) is public API only to work around the unexplained `internal` failure in DEV_REPORT item 11. Kotlin `internal` is module-scoped, so the failure points to the library being compiled under two module identities (workspace path vs `node_modules` symlink). It is worth understanding before publishing. `@RestrictTo` or a non-public interface would keep it out of the public API.
- **Unit test naming.** The test "module load configures native with platformSpecific defaults" (`src/__tests__/index.test.ts:71-84`) calls `resetLogger()` and asserts on that call. The real import-time call is cleared in `beforeEach` and never asserted. There are no native unit tests (XCTest or JUnit) for the buffer, eviction at 500, `attach`/`detach`, or reload. These were only exercised manually, and eviction never was.

## Efficiency

- **JS formats before filtering.** `createLogger.emit` calls `formatMessage` (which may run `JSON.stringify` on large objects) before `dispatchJsEntry` checks `minLevel` (`index.ts:239-247` vs `:142`). Filtered-out debug logs pay the full formatting cost. Check the level first.
- **JS allocates per call on the default logger.** `log.*` builds a new logger with six closures on every call (`index.ts:263-267`). Cache one logger per `defaultTag`, or call an internal `emit(state.defaultTag, ...)` directly.
- **iOS and Android build entries even when nothing will consume them.** See B7. In the default configuration, every native call allocates an entry and touches the ring buffer under the lock. iOS builds the `NSDictionary` and calls `[NSDate date]` inside the critical section (`RNUnifiedLoggerCore.mm:89-95`); build it before taking the lock.
- **Android does I/O under the lock.** See B8.
- **Native → JS has no batching.** See the design issues above.
- **`os_log_create` per tag is cached.** That is correct.

## Documentation inaccuracies

README line numbers refer to `react-native-unified-logger/README.md`.

1. **Line 3:** "Entries logged natively before JavaScript has started are buffered (up to 500) and delivered once JavaScript is ready." They are delivered only when forwarding is enabled (a callback or `js`). The same overstatement appears in `UnifiedLogger.kt:16-18` KDoc ("delivered once it does").
2. **Line 38:** "Extra arguments are formatted the way `console.log` would, joined by spaces." RN's `console` polyfill uses `inspect(depth 10)` and joins with `", "` (`console.js:398-402`). The library uses `JSON.stringify` and spaces. For example, `Map`/`Set` become `{}` and circular objects become `[object Object]`. Describe the actual rules without the console.log comparison.
3. **Lines 101-124 (Kotlin sample):** it uses `UnifiedLogLevel.INFO` (line 120) but imports only `com.unifiedlogger.UnifiedLogger` (line 104), so it does not compile as written. Add `import com.unifiedlogger.UnifiedLogLevel`.
4. **Line 173:** "The new routing applies to all layers immediately." The JS layer changes immediately. Native changes asynchronously, because void Turbo Module methods are queued, so in-flight native entries follow the old routing (B11).
5. **Lines 179, 192, 306-307:** "it always receives every entry that passes `minLevel`, from all three layers" and the reload caveat are incomplete. They omit the post-reload drop window (B4), the asymmetric JS/native retention, and that native startup entries are written locally regardless of the eventual destination (B5).
6. **Line 187 (`platformSpecific`/`js` JS entries "Written to the JS console"):** this omits that `console.error` also triggers LogBox in dev and `ExceptionsManager` soft-exception reports in Release (B1), and that `console.warn` triggers LogBox in dev.
7. **Line 203:** public logging is presented without the privacy trade-off.
8. **Missing sections:**
   - Jest mocking (B6).
   - Message-size truncation: logcat truncates at about 4 KB per entry; os_log may truncate very long messages. That last point is from Apple's documented behavior, not verified here.
   - That `log.error` in `platformSpecific` mode reports soft exceptions.
   - The multi-instance limitation (B12).
   - That a raised `minLevel` does not retroactively filter in-flight native entries.
9. **`RNUnifiedLogger.podspec:22-23` comment** says c++20 is set; it is overwritten (B2).
10. **`DEV_REPORT.md:16` (item 3)** says the demo "resolves the library through the `source` export condition". Item 9 (line 22) and `example/metro.config.js:22-27` show this was replaced by a `resolveRequest` redirect.
11. **`DEV_REPORT.md:32`:** "Typecheck of both packages passes" is accurate. The lint claim elsewhere covers only `example/App.tsx` and `example/metro.config.js`; library sources are not linted, and there is no ESLint config in the library.

## Packaging/publish readiness

- **`package.json` lacks `repository`, `author`, `homepage` and `bugs`.** The podspec then produces `s.source = { :git => "" }` (`RNUnifiedLogger.podspec:14`) and a made-up `authors` string. Autolinking from `node_modules` tolerates this, but `pod spec lint` fails, and npm shows no repository link.
- **`codegenConfig` lacks `ios.modulesProvider`** (B3).
- **`files` is correct.** `npm pack --dry-run --ignore-scripts` (run for this review) lists 29 files: `src`, `lib`, `android` (no build dirs), `ios`, the podspec, README and LICENSE. No tests or `NATIVE_CONTRACT.md` are included.
- **`lib/` on disk is stale.** It was built at 21:41; `src/index.ts` was modified at 21:54 (a prettier pass, and exports are identical). `prepare: bob build` rebuilds on publish, so this only matters for anyone packing with `--ignore-scripts`.
- **Exports and types.** `main` points at ESM (`lib/module`, `"type": "module"` in `lib/module/package.json`) and `exports` has `source`/`types`/`default`. This is fine for Metro and TypeScript `bundler`/`node16` resolution. There is no CommonJS build; Jest consumers rely on the RN Babel preset transforming `node_modules/react-native-unified-logger`, which `@react-native/jest-preset`'s `transformIgnorePatterns` does not include by default. Add a jest mock (B6) or a CommonJS target.
- **Peer dependencies.** `react: "*"` is loose; prefer `>=19` to match RN 0.88. `react-native: ">=0.88.0"` matches the requirement.
- **No Jest mock is shipped** (B6).
- **No `react-native.config.js`.** Not needed; Android autolinking found `UnifiedLoggerPackage` and the Debug/Release APKs registered the module.
- **No CHANGELOG, CI, or native tests.** Expected for 0.1.0, but worth tracking.

## Verification audit

I re-ran four checks myself (Node 24.21.0 via nvm):

| Check | Result |
| --- | --- |
| `node_modules/.bin/jest` | 15/15 pass |
| `tsc --noEmit -p react-native-unified-logger/tsconfig.json` | exit 0 |
| `tsc --noEmit -p example/tsconfig.json` | exit 0 |
| `eslint App.tsx metro.config.js` (from `example/`) | exit 0 |

Additionally, `cd example && ../node_modules/.bin/jest` fails (B6). Nothing claims that check passed, but it is the demo's `npm test`.

Transcript: the session transcript file, kept outside the repo (225 tool calls). Timestamps in the transcript are UTC; file times and `log stream` times are PST (UTC−8).

| Claim (DEV_REPORT) | Verdict | Evidence |
| --- | --- | --- |
| 15 unit tests pass | Confirmed | Re-run: 15 passed. Session calls 132, 208 show the same. |
| Typecheck passes | Confirmed | Re-run, and session call 208 (`TSC_OK`). |
| Lint passes | Partially confirmed | Only `App.tsx` and `metro.config.js` were linted (call 208 `LINT_OK`; the first run at call 132 had 1 error that was fixed). The library is not linted. |
| `npm pack --dry-run` lists only the intended files | Confirmed | Call 78; re-run here (29 files). |
| iOS Debug build and run on simulator | Confirmed | `tasks/b15pxr9p6.output` `** BUILD SUCCEEDED **` (21:45, `generic/platform=iOS Simulator` after the by-id destination failed in `bu86x1mfw.output` because of CoreSimulator); install and launch in calls 105-106; screenshots `ios-1.png`, `ios-final.png`. Later by-id builds: `brza24el3.output` (22:07). |
| Android Debug build and run on emulator | Confirmed | First builds failed (`bx2ox6l9p`, `b08btxph4`: settings.gradle); `bq71evvxb.output` `BUILD SUCCESSFUL in 1m 29s` (21:44); a later rebuild failed on the `internal` visibility error (`bp1wqg1zi`) and succeeded after making `emit` public (`bk2gm50gw`, 21:52); `bicdesmh1` (22:07). Installed with `adb -s emulator-5554`. |
| A: defaults → `ReactNativeJS` / `com.facebook.react.log:javascript` with D/I/W/E | Confirmed | Call 119 (Android: `D/ReactNativeJS … [App] JS debug #1` through `E/ReactNativeJS`); call 120 (iOS: `Db`/`I`/`I`/`E [com.facebook.react.log:javascript]`; warn shown as `I`, as documented). |
| B: `native` → real tags, iOS types Db/I/Df/E | Confirmed | Call 119: `D/App`, `I/Network`, `W/App`, `E/Network`. Call 120: `Db [org.reactjs.native.example.LoggerDemo:App]`, `I`, `Df`, `E`. No generic-tag lines. |
| C: callback on, destination derived to `none`, nothing local, callback gets JS + lifecycle | Partially confirmed | The first run on both platforms (calls 119/120) ran with destination still `native` because of a demo bug (config printed `"localDestination":"native"`; entries were written locally). After the `App.tsx` fix (call 121), C was re-run: iOS (calls 127/129) and Android (call 131) both show an empty native log and `received()` with 8 JS entries plus 2 lifecycle entries and config `none`. The iOS re-run printed only section C. |
| D: callback + `js` | Confirmed | Calls 119/120 and 131: lifecycle lines appear only under `ReactNativeJS` / `javascript` as `[Lifecycle] …`; none under the real tag (so `logLocally=false` holds); `received()` has both entries. |
| E: callback + `platformSpecific` + `minLevel: warn` | Confirmed, weak | Calls 119/120/131: JS info absent, JS error logged and received, no lifecycle lines locally or in the callback. The foreground cycle produces only debug/info native entries, so there is no positive control showing a warn/error native entry still passing. |
| The matrix ran on the final code | Not supported | The matrix (05:49-05:54 UTC) ran before the 06:06:50 UTC native change (call 159: the buffer is no longer cleared on forwarding-off configure). The first iOS run (call 120) used the app installed from the 21:45 build, which predates the `everForwarded` change (call 115, 21:49); the 21:49:58 build was installed only at call 123. The matrix was not re-run after either native change. Risk is low because A/B/D/E don't depend on the change, but the claim implicitly covers code that was changed afterwards. |
| Startup buffering, delivered in order, on both platforms | Confirmed | iOS call 123: `received` = didFinishLaunching, info, warn, error, then `didBecomeActive` (newest-first list), with matching os_log lines at 21:51:28.97x. Android call 130: same with Kotlin entries. Re-confirmed on post-22:06 code by the iOS `use_frameworks!` run (call 191) and the Android Release screenshot. |
| JS reload (dev) | Partially confirmed | Android (call 172): after reload the config is the defaults and `received` is 0; re-enabling the callback delivers `onActivityPaused`/`onActivityResumed`, and the `native` warn shows as `W/App`. iOS (calls 171, 173, 175): the module works after reload (`Df [...:App] JS warn #1`), but all 6 attempts gave `received: []`. The report admits the iOS window was not hit; the output also shows the post-reload drop described in B4. |
| `use_frameworks!` | Partially confirmed | Static only: `USE_FRAMEWORKS=static pod install` (call 174, `bqes634uh`), `bcssbso6y.output` `** BUILD SUCCEEDED **`, run in call 191 shows `React.framework` in the bundle, startup buffering, callback and `native` destination. Dynamic frameworks were not tested, although DEV_REPORT says `DEFINES_MODULE` "covers both linkages". The xcconfig loss in B2 is more likely to matter with dynamic frameworks. |
| iOS Release build and run | Partially confirmed | `b7231awzd.output` `** BUILD SUCCEEDED **`, `main.jsbundle` present; call 203 os_log shows Swift startup entries with Db/I/Df/E, `[App] App mounted {"dev":false}` under `javascript` (RN forwarding active in Release), and lifecycle entries. The callback, `native` destination and startup delivery were not exercised in Release (admitted). |
| Android Release build and run | Confirmed, with caveats | Two failures (`bkypttdxi`, `b49487cw0`: hermesc location), then `bct1ljhnx` `BUILD SUCCESSFUL`. Call 192's first run of `android-release-test.sh` failed outright (`command not found: adb -s emulator-5554`; the APK did not exist yet) and was fixed in call 196. Call 205 shows startup Kotlin entries plus `App mounted {"dev":false}`, JS info/warn as `I/W ReactNativeJS`, and no logcat output after "callback ON" + JS error. The screenshot `android-release.png` (inspected) shows `callback: ON`, `destination=none`, and 9 received entries including startup Kotlin entries, JS errors and lifecycle. Caveats: `enableProguardInReleaseBuilds = false`, so R8 was not exercised; taps used hard-coded coordinates, with the screenshot as the only positive control. |
| CoreSimulator fixed | Confirmed | Later builds by simulator id succeeded (`brza24el3`, `b7231awzd`). |

Overall: no claim is contradicted outright. The overstated ones:

- The matrix is presented as verifying the final code; it ran on earlier native builds.
- "JS reload … verified on both platforms": the iOS buffering path was not verified, and its output shows a gap.
- "`use_frameworks!` … covers both linkages": only static frameworks were tested.
- "Release builds on both platforms": the iOS callback path and R8 were not covered.

## Suggested follow-ups

1. Fix B2 (move `DEFINES_MODULE` before `install_modules_dependencies`) and B3 (`ios.modulesProvider`), then re-run `pod install` and confirm the xcconfig now has `CLANG_CXX_LANGUAGE_STANDARD` and `-DRCT_NEW_ARCH_ENABLED=1`. Also build once with `USE_FRAMEWORKS=dynamic`, and once with `RCT_REMOVE_LEGACY_MODULE_INTEROP=1 RCT_REMOVE_LEGACY_COMPONENT_INTEROP=1`.
2. Decide the `console.error` policy (B1) and document it.
3. Redesign the import-time configure so reload and cold start behave the same, and give apps a way to suppress pre-JS local output (B4, B5, B7).
4. Ship a Jest mock and fix `example/__tests__/App.test.tsx` (B6).
5. Move Android `Log.*` out of the lock; null-safe Java API; clamp `minLevel` on Android (B8-B10).
6. Fix the README items above, especially the Kotlin import and the buffering, reload and startup statements.
7. Add native unit tests for the buffer (eviction at 500, flush order, `attach`/`detach`/reload) and a JS test for `handleNativeEntry` under `minLevel`.
8. Re-run the A–E matrix on the final native code, add a warn-level native entry as a positive control for E, and exercise R8 (`minifyEnabled true`) once.
9. Fill in `repository`/`author`/`homepage`, tighten the `react` peer range, and drop `ndkVersion`/`buildConfig`/`kotlin-stdlib` from the library Gradle file.

---

## Author response (added after the review)

| Finding | Action |
| --- | --- |
| B1 `log.error` → LogBox / non-fatal exception | Kept (it is what `console.error` does and what users of console-based loggers expect). Documented in README under "console.warn and console.error" with the `native` / callback-only alternatives. |
| B2 podspec overwrote `install_modules_dependencies` settings | Fixed: `DEFINES_MODULE` is set before the call; generated xcconfig now has c++20 and `RCT_NEW_ARCH_ENABLED`. |
| B3 no `ios.modulesProvider` | Fixed: `codegenConfig.ios.modulesProvider = { UnifiedLogger: RNUnifiedLoggerModule }`; generated `RCTModuleProviders.mm` now maps it. |
| B4 entries dropped after reload | Fixed by removing the import-time `configure` call. Native treats a runtime as unconfigured until the app's `configureLogger`/`resetLogger`, on cold start and after a reload alike. `everForwarded` removed. |
| B5 pre-configure native entries written locally | Documented (native cannot know future settings). A native opt-out is listed as a follow-up. |
| B6 no Jest mock | Fixed: `react-native-unified-logger/jest/mock` shipped and documented; the demo's own Jest run passes. |
| B7 unbounded-in-time retention | Kept bounded at 500 entries; documented cost. Opt-out is a follow-up. |
| B8 Android logcat / map building under lock | Fixed: logcat write moved outside the lock; map building and emit stay inside for ordering. |
| B9 Java null crash | Fixed: nullable parameters with "" / "null" fallbacks. |
| B10 level clamping | Fixed on Android (`configure`, `log`), iOS (clamp in double domain), JS (non-finite → debug). |
| B11 `handleNativeEntry` minLevel | Fixed: JS re-applies `minLevel` to forwarded entries. |
| B12 reentrancy / multiple hosts | Documented in README caveats; emission stays under the lock for ordering. |
| Docs (Kotlin import, "delivered once ready", formatting claim, "immediately", DEV_REPORT item 3) | Fixed. |
| Packaging (`repository`/`author`) | Left for the owner to fill in before `npm publish`; `homepage` added. |
| Verification audit qualifications | Matrix re-run on final code on both platforms; demo background entry is now a warn (positive control for scenario E); dynamic frameworks build added; library now linted. iOS Release callback path remains untested by taps. |
