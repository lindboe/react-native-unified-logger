package com.unifiedlogger

import android.util.Log

/** Severity of a log entry. [value] is the number that crosses the JS/native boundary. */
enum class UnifiedLogLevel(val value: Int) {
  DEBUG(0),
  INFO(1),
  WARN(2),
  ERROR(3),
}

/**
 * Public logging API for Kotlin and Java code in the app.
 *
 * Entries are filtered by the JS-configured minimum level, written to logcat when local logging is
 * on, and forwarded to JS when forwarding is on. Entries logged before the app has configured the
 * logger from JS are buffered (up to 500) and delivered the first time forwarding is enabled.
 *
 * Safe to call from any thread, including before React Native has started.
 */
object UnifiedLogger {
  /**
   * Logs [message] under [tag] at [level].
   *
   * @param level severity of the entry.
   * @param tag logcat tag and the `tag` field seen by the JS callback.
   * @param message the log text.
   */
  @JvmStatic
  fun log(level: UnifiedLogLevel, tag: String?, message: String?) {
    // Never crash the caller: Java code may pass null.
    UnifiedLoggerCore.logFromNative(level, tag ?: "", message ?: "null")
  }

  /** Logs [message] under [tag] at [UnifiedLogLevel.DEBUG]. */
  @JvmStatic fun d(tag: String?, message: String?) = log(UnifiedLogLevel.DEBUG, tag, message)

  /** Logs [message] under [tag] at [UnifiedLogLevel.INFO]. */
  @JvmStatic fun i(tag: String?, message: String?) = log(UnifiedLogLevel.INFO, tag, message)

  /** Logs [message] under [tag] at [UnifiedLogLevel.WARN]. */
  @JvmStatic fun w(tag: String?, message: String?) = log(UnifiedLogLevel.WARN, tag, message)

  /** Logs [message] under [tag] at [UnifiedLogLevel.ERROR]. */
  @JvmStatic fun e(tag: String?, message: String?) = log(UnifiedLogLevel.ERROR, tag, message)

  /** Logs [message] at [UnifiedLogLevel.DEBUG], followed by the stack trace of [tr] if non-null. */
  @JvmStatic
  fun d(tag: String?, message: String?, tr: Throwable?) =
      log(UnifiedLogLevel.DEBUG, tag, withStackTrace(message, tr))

  /** Logs [message] at [UnifiedLogLevel.INFO], followed by the stack trace of [tr] if non-null. */
  @JvmStatic
  fun i(tag: String?, message: String?, tr: Throwable?) =
      log(UnifiedLogLevel.INFO, tag, withStackTrace(message, tr))

  /** Logs [message] at [UnifiedLogLevel.WARN], followed by the stack trace of [tr] if non-null. */
  @JvmStatic
  fun w(tag: String?, message: String?, tr: Throwable?) =
      log(UnifiedLogLevel.WARN, tag, withStackTrace(message, tr))

  /** Logs [message] at [UnifiedLogLevel.ERROR], followed by the stack trace of [tr] if non-null. */
  @JvmStatic
  fun e(tag: String?, message: String?, tr: Throwable?) =
      log(UnifiedLogLevel.ERROR, tag, withStackTrace(message, tr))

  // Mirrors android.util.Log's (tag, msg, tr) overloads: message, newline, stack trace.
  private fun withStackTrace(message: String?, tr: Throwable?): String =
      if (tr == null) message ?: "null" else (message ?: "null") + "\n" + Log.getStackTraceString(tr)
}
