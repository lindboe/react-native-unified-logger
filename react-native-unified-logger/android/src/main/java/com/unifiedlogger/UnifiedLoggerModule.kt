package com.unifiedlogger

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

/**
 * Turbo Module backing `NativeUnifiedLogger` in JS. Extends the codegen-generated
 * [NativeUnifiedLoggerSpec]; all state lives in [UnifiedLoggerCore] so it survives reloads and is
 * reachable before this module exists.
 */
@ReactModule(name = NativeUnifiedLoggerSpec.NAME)
class UnifiedLoggerModule(reactContext: ReactApplicationContext) :
    NativeUnifiedLoggerSpec(reactContext) {

  override fun initialize() {
    super.initialize()
    UnifiedLoggerCore.attach(this)
  }

  override fun invalidate() {
    UnifiedLoggerCore.detach(this)
    super.invalidate()
  }

  override fun configure(config: ReadableMap) {
    UnifiedLoggerCore.configure(
        module = this,
        forward = config.getBoolean("forwardToJs"),
        local = config.getBoolean("logLocally"),
        min = config.getDouble("minLevel").let { if (it.isNaN()) 0 else it.coerceIn(0.0, 3.0).toInt() },
    )
  }

  override fun log(level: Double, tag: String, message: String) {
    val clamped = if (level.isNaN()) 0 else level.coerceIn(0.0, 3.0).toInt()
    UnifiedLoggerCore.writeToPlatformLog(clamped, tag, message)
  }

  /**
   * Sends a native entry to JS listeners of `onLog`. Callable from any thread. Public only because
   * [UnifiedLoggerCore] needs it; app code should use [UnifiedLogger] instead.
   */
  fun emit(entry: ReadableMap) {
    emitOnLog(entry)
  }

  companion object {
    const val NAME = NativeUnifiedLoggerSpec.NAME
  }
}
