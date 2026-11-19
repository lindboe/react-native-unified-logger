package com.unifiedlogger

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.lang.ref.WeakReference

/**
 * Process-wide state shared by the public [UnifiedLogger] API and the Turbo Module.
 *
 * Settings and the buffer are guarded by [lock]. logcat writes happen outside the lock. Emission to
 * JS happens while holding the lock so entries reach JS in the order they were logged; this is safe
 * because the generated `emitOnLog` only schedules the JS call (AsyncEventEmitter -> AsyncCallback
 * via the JS CallInvoker) and never blocks on JS.
 */
internal object UnifiedLoggerCore {
  private const val MAX_BUFFER = 500
  private const val SOURCE = "android"

  /**
   * A native-originated entry. Kept as a plain object so it can be buffered before React's native
   * libraries are loaded (WritableNativeMap needs them).
   */
  private class Entry(
      val level: Int,
      val tag: String,
      val message: String,
      val timestamp: Double,
  )

  private val lock = Any()

  // Settings from JS `configure`. Defaults apply until the first call.
  private var forwardToJs = false
  private var logLocally = true
  private var minLevel = 0

  /**
   * True once the app has called `configure` on the live JS runtime. Until then (process start, or
   * a JS reload) entries are retained, bounded, so a callback enabled later still receives them.
   */
  private var configured = false
  private val buffer = ArrayDeque<Entry>()
  private var moduleRef: WeakReference<UnifiedLoggerModule>? = null

  /** Entry point for the public API (contract step 2). */
  fun logFromNative(level: UnifiedLogLevel, tag: String, message: String) {
    val entry = Entry(level.value, tag, message, System.currentTimeMillis().toDouble())
    val writeLocally: Boolean
    synchronized(lock) {
      if (entry.level < minLevel) return
      writeLocally = logLocally
      val module = moduleRef?.get()
      if (configured && forwardToJs && module != null) {
        module.emit(toWritableMap(entry))
      } else if (!configured || forwardToJs) {
        // The app has not configured this runtime yet (startup or reload), or forwarding is on but
        // the module is gone: keep for later.
        if (buffer.size >= MAX_BUFFER) buffer.removeFirst()
        buffer.addLast(entry)
      }
      // Configured with forwarding off: nothing to deliver, so nothing to keep.
    }
    if (writeLocally) writeToPlatformLog(entry.level, tag, message)
  }

  /** JS `configure` (contract step 3). Flushes the buffer when forwarding is on. */
  fun configure(module: UnifiedLoggerModule, forward: Boolean, local: Boolean, min: Int) {
    synchronized(lock) {
      forwardToJs = forward
      logLocally = local
      minLevel = min.coerceIn(0, 3)
      configured = true
      // configure() can only arrive through a live module, so make sure it is the attached one.
      moduleRef = WeakReference(module)
      if (forward) {
        while (buffer.isNotEmpty()) module.emit(toWritableMap(buffer.removeFirst()))
      }
      // With forwarding off the buffer is kept (it is bounded). It holds entries from before this
      // runtime was configured; the next configure with forwarding on delivers them.
    }
  }

  /** Called from the module's initialize(). */
  fun attach(module: UnifiedLoggerModule) {
    synchronized(lock) {
      if (moduleRef?.get() === module) return
      moduleRef = WeakReference(module)
      // A new instance means a new JS runtime that has not subscribed to onLog yet; buffer until
      // the app configures it, otherwise entries emitted before the subscription would be dropped.
      configured = false
    }
  }

  /** Called from the module's invalidate(). */
  fun detach(module: UnifiedLoggerModule) {
    synchronized(lock) {
      if (moduleRef?.get() === module) {
        moduleRef = null
        // JS is gone; buffer again until the next runtime is configured.
        configured = false
      }
    }
  }

  /** JS-originated entry (contract step 4): always written to logcat, never emitted or buffered. */
  fun writeToPlatformLog(level: Int, tag: String, message: String) {
    when {
      level <= 0 -> Log.d(tag, message)
      level == 1 -> Log.i(tag, message)
      level == 2 -> Log.w(tag, message)
      else -> Log.e(tag, message)
    }
  }

  private fun toWritableMap(entry: Entry): WritableMap =
      Arguments.createMap().apply {
        putDouble("level", entry.level.toDouble())
        putString("tag", entry.tag)
        putString("message", entry.message)
        putDouble("timestamp", entry.timestamp)
        putString("source", SOURCE)
      }
}
