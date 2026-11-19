# Native contract for react-native-unified-logger (internal design note)

Package: `react-native-unified-logger`. Turbo Module registered name: `UnifiedLogger`.
Codegen (package.json `codegenConfig`): name `RNUnifiedLoggerSpec`, type `modules`, jsSrcsDir `src`, Android javaPackageName `com.unifiedlogger`.
Spec file: `src/NativeUnifiedLogger.ts` (read it; it is the source of truth). Generated artifacts:
- iOS: header `RNUnifiedLoggerSpec/RNUnifiedLoggerSpec.h` providing protocol `NativeUnifiedLoggerSpec`, base class `NativeUnifiedLoggerSpecBase` (provides `- (void)emitOnLog:(NSDictionary *)value;`), C++ class `NativeUnifiedLoggerSpecJSI`, and struct helpers `JS::NativeUnifiedLogger::NativeConfig` (fields `forwardToJs()`, `logLocally()`, `minLevel()`).
- Android: abstract class `com.unifiedlogger.NativeUnifiedLoggerSpec` with `abstract fun configure(config: ReadableMap)`, `abstract fun log(level: Double, tag: String, message: String)`, and a protected `emitOnLog(value: ReadableMap)`; `NAME` constant = "UnifiedLogger".

## Levels
0 = debug, 1 = info, 2 = warn, 3 = error (numbers cross the JS/native boundary; public native APIs use enums).

## Native-side responsibilities (same on both platforms)
1. A process-wide core singleton holds: `forwardToJs` (default false), `logLocally` (default true), `minLevel` (default 0), `configured` (default false; set by `configure`, cleared when a module instance is created or invalidated, i.e. on JS start/reload), a bounded FIFO buffer (max 500) and a weak reference to the live module instance.
2. Public native logging API: produces an entry {level, tag, message, timestamp(ms since epoch, double), source: "ios"|"android"} then:
   - if level < minLevel: drop.
   - if logLocally: write to the platform log (iOS: os_log; Android: android.util.Log) with the real tag and mapped level. Do this outside the lock.
   - if configured and forwardToJs and the module instance is alive: `emitOnLog(entry)` (under the lock, to keep ordering; emitOnLog only schedules work on the JS thread).
   - else if not configured, or forwardToJs but the instance is gone: append to the buffer (evict oldest when full).
   - else (configured, forwarding off): do not buffer.
3. `configure(config)` from JS: update the three settings, mark configured; if forwardToJs, flush the buffer in order via emitOnLog and clear it; otherwise keep the buffer untouched. JS never calls configure at import time; only the app's `configureLogger`/`resetLogger` does, so "unconfigured" means "the app has not decided yet" on both a cold start and a reload.
4. `log(level, tag, message)` from JS: write directly to the platform log (always). Do NOT emit back to JS and do NOT buffer.
5. Thread safety: the public API may be called from any thread; guard core state with a lock. Clamp levels to 0..3 in every entry point.
6. Null-safety: never crash the caller. A nil/null tag or message becomes "" on both platforms (a nil format string on iOS also yields ""); a null level from Java becomes debug.

## Platform log mapping
iOS (os_log): debug→OS_LOG_TYPE_DEBUG, info→OS_LOG_TYPE_INFO, warn→OS_LOG_TYPE_DEFAULT, error→OS_LOG_TYPE_ERROR. Subsystem = main bundle identifier (fallback "react-native-unified-logger"), category = tag. Cache `os_log_t` per tag in a dictionary under the lock. Format `"%{public}@"`.
Android (android.util.Log): debug→Log.d, info→Log.i, warn→Log.w, error→Log.e. Tag used verbatim.
