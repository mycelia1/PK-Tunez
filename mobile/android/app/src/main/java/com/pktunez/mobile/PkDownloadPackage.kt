package com.pktunez.mobile

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class PkDownloadPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    if (name == PkDownloadModule.NAME) return PkDownloadModule(reactContext)
    return null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
          PkDownloadModule.NAME to
              ReactModuleInfo(
                  PkDownloadModule.NAME,
                  PkDownloadModule::class.java.name,
                  false,
                  false,
                  false,
                  false))
    }
  }
}
