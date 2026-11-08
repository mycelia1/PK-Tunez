package com.pktunez.mobile

/** Latest link handed to the app by the share sheet or a view intent. */
object ShareBus {
  @Volatile var pending: String? = null
}
