# react-native-unified-logger

Log the same way from TypeScript, Swift/Objective-C and Kotlin/Java in a React Native app. Output goes to the platform's native log: `os_log` on iOS (subsystem = your bundle identifier, category = the tag) and logcat on Android (using the tag). An optional JavaScript callback receives every entry from every layer (JS, iOS, Android), which makes remote logging a few lines of code. Entries logged natively before JavaScript has started are buffered (up to 500) and delivered once JavaScript is ready.

## Requirements

- React Native 0.88 or newer, New Architecture only. The module is a Turbo Module; there is no legacy bridge implementation.
- iOS and Android.
- Not compatible with Expo Go, because it contains custom native code. Use a development build or a bare React Native app.

## Installation

```sh
npm install react-native-unified-logger
cd ios && pod install
```

Both platforms use autolinking. No manual steps are needed.

### Jest

The native module does not exist under Jest, so importing the library in a test throws. Mock it once in your Jest setup file:

```js
jest.mock('react-native-unified-logger', () =>
  require('react-native-unified-logger/jest/mock'),
);
```

The mock records every call in `__entries`, exposes the same API with `jest.fn()` methods, and has `__emitNative(entry)` to simulate a native-originated entry reaching your callback.

## Quick start

```ts
import { log, createLogger, configureLogger } from 'react-native-unified-logger';

// Optional. Without this call the defaults apply (see "Configuration").
configureLogger({ defaultTag: 'MyApp', minLevel: 'debug' });

// The default logger uses the tag from `defaultTag` (default: "App").
log.debug('cache miss', { key: 'user:42' });
log.info('app started');
log.warn('slow response', 1250, 'ms');
log.error('request failed', new Error('timeout'));

// Generic form with an explicit level.
log.log('info', 'same as log.info');
```

Extra arguments are formatted into one string, joined by spaces (this is the library's own formatting, not React Native's console formatting):

- Strings are used as is.
- `Error` instances become their stack (or `name: message` when there is no stack).
- Objects and arrays are serialized with `JSON.stringify` (falling back to `String(value)` if that fails).
- `undefined` becomes `"undefined"` and functions become `[Function name]`.

### Tagged loggers

`createLogger(tag)` returns a logger bound to a tag. The tag becomes the logcat tag on Android and the `os_log` category on iOS.

```ts
const net = createLogger('Network');

net.info('GET /items', { page: 2 });
net.error('request failed', new Error('simulated timeout'));
```

Every logger (including `log`) has `debug`, `info`, `warn`, `error` and `log(level, message, ...rest)`, plus a read-only `tag`.

## Logging from native

The native API can be called before React Native starts and from any thread.

### Swift

```swift
import RNUnifiedLogger
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UnifiedLogger.debug(tag: "Startup", message: "didFinishLaunching")
    UnifiedLogger.info(tag: "Startup", message: "Swift info")
    UnifiedLogger.warn(tag: "Startup", message: "Swift warn")
    UnifiedLogger.log(.error, tag: "Startup", message: "Swift error")
    return true
  }
}
```

`UnifiedLogger.log(_:tag:message:)` takes a `UnifiedLogLevel` (`.debug`, `.info`, `.warn`, `.error`). The printf-style variants are Objective-C only; in Swift use string interpolation.

### Objective-C

```objc
#import <RNUnifiedLogger/RNUnifiedLogger.h>

[RNUnifiedLogger info:@"Tag" message:@"plain message"];
[RNUnifiedLogger log:RNULogLevelWarn tag:@"Tag" message:@"explicit level"];

// printf-style variants
[RNUnifiedLogger debug:@"Tag" format:@"user %@ has %d items", userName, count];
[RNUnifiedLogger error:@"Tag" format:@"failed with code %ld", (long)code];
[RNUnifiedLogger log:RNULogLevelInfo tag:@"Tag" format:@"value=%@", value];
```

Methods: `debug`, `info`, `warn`, `error` and `log:tag:`, each in a `message:` and a `format:` form. `RNULogLevel` values are `RNULogLevelDebug`, `RNULogLevelInfo`, `RNULogLevelWarn` and `RNULogLevelError`.

### Kotlin

```kotlin
import com.unifiedlogger.UnifiedLogLevel
import com.unifiedlogger.UnifiedLogger

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()

    UnifiedLogger.d("Startup", "Application.onCreate")
    UnifiedLogger.i("Startup", "Kotlin info")
    UnifiedLogger.w("Startup", "Kotlin warn")
    UnifiedLogger.e("Startup", "Kotlin error")

    // Throwable overloads append the stack trace after the message,
    // like android.util.Log.
    UnifiedLogger.e("Startup", "failed", IllegalStateException("simulated"))

    // Explicit level.
    UnifiedLogger.log(UnifiedLogLevel.INFO, "Startup", "explicit level")

    loadReactNative(this)
  }
}
```

`d`, `i`, `w` and `e` each have a `(tag, message)` and a `(tag, message, throwable)` overload. `UnifiedLogLevel` is `DEBUG`, `INFO`, `WARN` or `ERROR`.

### Java

All methods are static from Java.

```java
import com.unifiedlogger.UnifiedLogger;
import com.unifiedlogger.UnifiedLogLevel;

UnifiedLogger.i("Tag", "info message");
UnifiedLogger.w("Tag", "warn message");
UnifiedLogger.e("Tag", "failed", exception);
UnifiedLogger.log(UnifiedLogLevel.DEBUG, "Tag", "explicit level");
```

## Configuration

```ts
import { configureLogger, resetLogger, getLoggerConfig } from 'react-native-unified-logger';

configureLogger({
  callback: entry => {
    // send to your backend
  },
  localDestination: 'platformSpecific',
  minLevel: 'info',
  defaultTag: 'MyApp',
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `callback` | `((entry: LogEntry) => void) \| null` | `null` | Receives every entry from every layer (JS, iOS, Android). Intended for remote logging. Pass `null` to remove a previously set callback. |
| `localDestination` | `'platformSpecific' \| 'none' \| 'js' \| 'native'` | `platformSpecific` without a callback, `none` with a callback | Where entries show up locally. See [Where logs go](#where-logs-go). |
| `minLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'debug'` | Entries below this level are dropped in every layer. |
| `defaultTag` | `string` | `'App'` | Tag used by the default `log` instance. |

### Default destination rule

When you have never passed `localDestination`, it is derived from the callback on every `configureLogger` call: `platformSpecific` if there is no callback, `none` if there is one. Setting a callback therefore silences local output unless you also pass `localDestination`, for example `configureLogger({ callback, localDestination: 'platformSpecific' })` to get both.

Once you pass `localDestination` explicitly, that value is kept across later `configureLogger` calls that omit it, until you pass a new value or call `resetLogger()`. All other options you leave out keep their current value too.

### Reconfiguring at any time

`configureLogger` can be called again whenever you like, for example after the user opts in to diagnostics or after login. The JS side switches immediately; the native side is updated through an asynchronous Turbo Module call, so a native entry logged in the same instant may still follow the previous routing (JS re-applies `minLevel` to forwarded entries, so the callback never sees entries below the current level).

- `configureLogger({ callback: null })` removes the callback.
- `resetLogger()` restores the defaults: no callback, `platformSpecific`, `debug`, tag `App`.
- `getLoggerConfig()` returns a read-only snapshot: `{ localDestination, minLevel, defaultTag, hasCallback }`. The callback function itself is not exposed.

Until your app calls `configureLogger` (or `resetLogger`) on the current JS runtime, native treats the runtime as unconfigured: entries logged from Swift/Kotlin are written locally under the default `platformSpecific` routing and also retained, up to 500, so that a callback you enable later still receives startup logs. The same rule applies after a JS reload in development. Once the runtime is configured, native follows your routing: with forwarding off (no callback and not `js`), new native entries are not retained; anything already retained stays until the next time forwarding is enabled.

Two consequences worth knowing: entries logged natively before `configureLogger` runs go to `os_log` / logcat even if you then configure callback-only, because native cannot know your future settings; and an app that never configures the logger keeps the bounded 500-entry buffer for the life of the process (roughly the cost of 500 strings).

## Where logs go

What each `localDestination` does depends on where the entry was produced:

| `localDestination` | JS-originated entries (`log`, `createLogger`) | Native-originated entries (Swift/Obj-C/Kotlin/Java) |
| --- | --- | --- |
| `platformSpecific` | Written to the JS console as `[tag] message` (`console.debug`/`info`/`warn`/`error`). React Native then mirrors the console call to the native log under its own generic tag; see [console.warn and console.error](#consolewarn-and-consoleerror). | Written to `os_log` / logcat with the real tag and level. |
| `none` | Not written anywhere locally. | Not written anywhere locally. |
| `js` | Written to the JS console as `[tag] message`. | Forwarded to JavaScript and written to the JS console as `[tag] message`. Not written to `os_log` / logcat by this library. |
| `native` | Written to `os_log` / logcat with the real tag and level. Never touches the JS console, so it does not appear in Metro or React Native DevTools. | Written to `os_log` / logcat with the real tag and level. |

When a callback is set, it always receives every entry that passes `minLevel`, from all three layers, regardless of `localDestination`. The callback runs in addition to the local destination, not instead of it.

### console.warn and console.error

Where entries are "written to the JS console", `warn` and `error` entries go through React Native's `console.warn` / `console.error`. That has side effects beyond printing: in development they surface in LogBox, and in every build `console.error` is reported to React Native's ExceptionsManager as a non-fatal exception, which crash reporters that hook it (Sentry, Crashlytics) may record. This matches what a plain `console.error` in your own code does. If you want `log.error` to print without that, use `localDestination: 'native'` (JS entries go straight to `os_log` / logcat) or a callback-only setup.

## Level mapping

| Level | JS console method | Android `Log` priority | iOS `os_log` type |
| --- | --- | --- | --- |
| `debug` | `console.debug` | `Log.d` (DEBUG) | `OS_LOG_TYPE_DEBUG` |
| `info` | `console.info` | `Log.i` (INFO) | `OS_LOG_TYPE_INFO` |
| `warn` | `console.warn` | `Log.w` (WARN) | `OS_LOG_TYPE_DEFAULT` |
| `error` | `console.error` | `Log.e` (ERROR) | `OS_LOG_TYPE_ERROR` |

On iOS the subsystem is the main bundle identifier (falling back to `react-native-unified-logger` if there is none), the category is the tag, and messages are logged with the `%{public}` specifier so they are not redacted as `<private>` in Console.app or `log stream`. That means anything you log is readable by anyone who can read the device log; keep secrets out of log messages. On Android the tag is used verbatim.

### Viewing and filtering

`os_log` debug and info messages are not persisted by default. In Console.app, enable "Include Info Messages" and "Include Debug Messages" in the Action menu while streaming. From a terminal:

```sh
log stream --level debug --predicate 'subsystem == "com.example.myapp"'

# one category (tag)
log stream --level debug --predicate 'subsystem == "com.example.myapp" AND category == "Network"'
```

Replace `com.example.myapp` with your app's bundle identifier. On Android:

```sh
# only the "Network" tag, all priorities, nothing else
adb logcat -s Network:V
```

## How this relates to React Native's own console forwarding

React Native already mirrors every `console.*` call to the native logs. This is built in, active in both Debug and Release builds, and independent of this library:

- On iOS the output goes to `os_log` with subsystem `com.facebook.react.log` and category `javascript`.
- On Android it goes to logcat with the tag `ReactNativeJS`.
- On iOS, `console.debug` maps to `OS_LOG_TYPE_DEBUG`, `console.log` and `console.info` to `OS_LOG_TYPE_INFO`, and `console.error` to `OS_LOG_TYPE_ERROR`. `console.warn` is mapped to `OS_LOG_TYPE_INFO` (not `OS_LOG_TYPE_DEFAULT`).
- On Android the priorities are D, I, W and E for `console.debug`, `console.log`/`console.info`, `console.warn` and `console.error`.

Consequences for this library:

- With `platformSpecific` or `js`, JS-originated entries are written with `console.*`, so they also appear in the native logs, but under React Native's generic tags (`com.facebook.react.log` / `javascript` and `ReactNativeJS`) rather than your tag. Warnings on iOS show up as INFO.
- With `native`, JS-originated entries bypass the console and go straight to `os_log` / logcat with their real tag and level. Use it when you want JS entries to be filterable by tag in native tooling, and when you want them out of Metro and React Native DevTools.
- Plain `console.log` calls in your code keep going through React Native's forwarding regardless of this library's configuration.

## Remote logging

A callback that batches entries and POSTs them to a backend:

```ts
import { configureLogger, type LogEntry } from 'react-native-unified-logger';

const queue: LogEntry[] = [];
const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 10_000;

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await fetch('https://logs.example.com/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch {
    // Drop the batch (or put it back) but do NOT log from here.
  }
}

setInterval(flush, FLUSH_INTERVAL_MS);

configureLogger({
  minLevel: 'info',
  // Remote only: nothing is written locally (default with a callback).
  // Add localDestination: 'platformSpecific' to also keep local output.
  callback: entry => {
    queue.push(entry);
    if (queue.length >= MAX_BATCH) void flush();
  },
});
```

Notes:

- Do not call the logger from inside the callback, directly or through code it calls (including `fetch` error handlers). That feeds entries back into the callback and can loop.
- If the callback throws, the exception is caught and reported with `console.error`, so a failing sink cannot take the app down.
- The callback receives entries from iOS and Android native code too, including those logged before JavaScript started (see [Caveats](#caveats)). Check `entry.source` to tell them apart.

## `LogEntry` reference

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where an entry was produced. */
type LogSource = 'js' | 'ios' | 'android';

type LogEntry = {
  level: LogLevel;
  tag: string;
  message: string;
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  source: LogSource;
};

type LogCallback = (entry: LogEntry) => void;
```

Other exported types: `LocalDestination`, `LoggerOptions` and `Logger`. Other exported values: `formatMessage(message, rest)`, which formats a message plus extra arguments the way the loggers do, and `nativeSource`, which is `'ios'` or `'android'` and is the `source` value native entries carry on the current device.

## Caveats

- **Buffer size.** Native entries retained while the JS runtime is unconfigured (see [Configuration](#configuration)) are held in a buffer of at most 500 entries; when it is full, the oldest are dropped first. The buffer is delivered in order the next time forwarding is enabled. Local output (`os_log` / logcat) is never delayed; it is written immediately when local logging is enabled, including for entries logged before `configureLogger` ran.
- **JavaScript reloads.** A reload in development creates a new runtime that native treats as unconfigured, exactly like a cold start: native entries are retained until your app's `configureLogger` call runs again, then delivered if forwarding is on.
- **One React Native host.** The native state is a process-wide singleton attached to the most recently created JS runtime. Brownfield apps that run several React Native hosts in one process will have all native entries forwarded to the latest one.
- **iOS lock.** Native entries are handed to the JS event emitter while a non-recursive lock is held. Do not route React Native's own `RCTLog` output into `UnifiedLogger` on iOS, since anything on the emit path that logs through `RCTLog` would re-enter the logger.
- **Logcat tag length.** There is no tag length limit on Android API 26 and later. The package's minSdk is 24, and tags longer than 23 characters may be a problem on API 24 and 25 only. Keep tags short if you support those versions.
- **No persistence.** The library does not write logs to disk and does not retry delivery. What survives is whatever the platform log keeps (see [Viewing and filtering](#viewing-and-filtering)) and whatever your callback sends.

## Example app

The `example/` folder in the repository is a demo app that exercises the library:

- Four buttons log from TypeScript at each level, using both the default logger and a tagged `Network` logger.
- The Swift `AppDelegate` and the Kotlin `MainApplication` log at startup, before JavaScript is ready, and again on every return to the foreground (background and foreground the app to see those).
- Toggles for the callback, `localDestination` and `minLevel`, a line showing the effective configuration, and a list of every entry the callback receives from all layers.

## License

MIT
