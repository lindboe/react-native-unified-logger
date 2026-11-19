package com.loggerdemo

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.unifiedlogger.UnifiedLogger

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()

    // Demo: log from Kotlin before React Native has started. These entries are
    // buffered natively and delivered to the JS callback once JS configures
    // the logger (if a callback / `js` destination is in effect), and written
    // to logcat immediately under the tag "LoggerDemo".
    UnifiedLogger.d("LoggerDemo", "Application.onCreate (Kotlin, before RN start)")
    UnifiedLogger.i("LoggerDemo", "Kotlin info at startup")
    UnifiedLogger.w("LoggerDemo", "Kotlin warn at startup")
    UnifiedLogger.e("LoggerDemo", "Kotlin error at startup", IllegalStateException("simulated"))

    // Demo: log from Kotlin every time the app returns to the foreground.
    registerActivityLifecycleCallbacks(
      object : ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
          UnifiedLogger.i("Lifecycle", "onActivityResumed ${activity.localClassName} (Kotlin)")
        }
        override fun onActivityPaused(activity: Activity) {
          UnifiedLogger.w("Lifecycle", "onActivityPaused ${activity.localClassName} (Kotlin); pending work may be suspended")
        }
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
      }
    )

    loadReactNative(this)
  }
}
