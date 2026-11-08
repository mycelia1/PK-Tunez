package com.pktunez.mobile

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "PKTunez"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    captureShare(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    captureShare(intent)
  }

  private fun captureShare(intent: Intent?) {
    val text = intent?.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    val data = intent?.dataString?.trim().orEmpty()
    val value = if (text.isNotEmpty()) text else data
    if (value.isNotEmpty()) ShareBus.pending = value
  }
}
