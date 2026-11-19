package com.unifiedlogger

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [UnifiedLoggerModule]. Picked up by autolinking as the library's only ReactPackage. */
class UnifiedLoggerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == UnifiedLoggerModule.NAME) UnifiedLoggerModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        UnifiedLoggerModule.NAME to
            ReactModuleInfo(
                name = UnifiedLoggerModule.NAME,
                className = UnifiedLoggerModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
    )
  }
}
