package com.pktunez.mobile

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class PkDownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val pool = Executors.newSingleThreadExecutor()
  @Volatile private var engineReady = false
  @Volatile private var extractorFresh = false

  override fun getName(): String = NAME

  companion object {
    const val NAME = "PkDownload"
  }

  @ReactMethod
  fun musicDir(promise: Promise) {
    val dir = File(reactContext.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "PK-Tunez")
    if (!dir.exists()) dir.mkdirs()
    promise.resolve(dir.absolutePath)
  }

  @ReactMethod
  fun consumeShare(promise: Promise) {
    val value = ShareBus.pending
    ShareBus.pending = null
    promise.resolve(value)
  }

  @ReactMethod
  fun readText(name: String, promise: Promise) {
    pool.execute {
      try {
        val file = File(reactContext.filesDir, safeName(name))
        promise.resolve(if (file.exists()) file.readText(Charsets.UTF_8) else "")
      } catch (error: Exception) {
        promise.reject("read_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun writeText(name: String, text: String, promise: Promise) {
    pool.execute {
      try {
        File(reactContext.filesDir, safeName(name)).writeText(text, Charsets.UTF_8)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("write_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun downloadAudio(url: String, outputDir: String, playlist: Boolean, promise: Promise) {
    pool.execute {
      try {
        ensureEngine()
        prepareYouTube(url)
        val dir = File(outputDir)
        if (!dir.exists()) dir.mkdirs()
        val before = dir.walkTopDown().filter { it.isFile }.map { it.absolutePath }.toSet()
        val request = YoutubeDLRequest(url)
        request.addOption("-f", "bestaudio[ext=m4a]/bestaudio/best")
        request.addOption("-x")
        request.addOption("--audio-format", "m4a")
        request.addOption("--audio-quality", "0")
        request.addOption("--embed-metadata")
        request.addOption("--no-mtime")
        request.addOption("-o", File(dir, "%(title)s.%(ext)s").absolutePath)
        if (playlist) request.addOption("--yes-playlist") else request.addOption("--no-playlist")
        if (isYouTube(url)) {
          // The library copy warns, then YouTube returns HTTP 403. A current
          // yt-dlp picks a client that still has a real audio URL.
          request.addOption("--no-update")
          if (versionStamp(YoutubeDL.getInstance().versionName(reactContext)) < "20260817") {
            request.addOption("--extractor-args", "youtube:player_client=ios,tv,mweb")
          }
        }
        YoutubeDL.getInstance().execute(request)
        val created = dir.walkTopDown().filter { file ->
          file.isFile &&
            !file.name.endsWith(".part") &&
            !file.name.endsWith(".info.json") &&
            !before.contains(file.absolutePath)
        }.map { it.absolutePath }.toList()
        created.forEach { publishToMusic(File(it)) }
        val result = Arguments.createArray()
        created.forEach { result.pushString(it) }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("download_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun downloadToFile(url: String, headers: ReadableMap?, dest: String, promise: Promise) {
    pool.execute {
      try {
        val file = File(dest)
        file.parentFile?.mkdirs()
        val connection = open(url, headers)
        connection.requestMethod = "GET"
        connection.connect()
        if (connection.responseCode !in 200..299) {
          promise.reject("download_failed", "Download failed (${connection.responseCode}).")
          connection.disconnect()
          return@execute
        }
        connection.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        connection.disconnect()
        publishToMusic(file)
        promise.resolve(file.absolutePath)
      } catch (error: Exception) {
        promise.reject("download_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun uploadFile(url: String, headers: ReadableMap, filePath: String, promise: Promise) {
    pool.execute {
      try {
        val file = File(filePath)
        if (!file.isFile) {
          promise.reject("upload_failed", "File not found.")
          return@execute
        }
        val connection = open(url, headers)
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(file.length())
        connection.outputStream.use { out -> file.inputStream().use { it.copyTo(out) } }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        connection.disconnect()
        val map = Arguments.createMap()
        map.putInt("status", code)
        map.putString("body", body)
        promise.resolve(map)
      } catch (error: Exception) {
        promise.reject("upload_failed", error.message, error)
      }
    }
  }

  private fun ensureEngine() {
    if (engineReady) return
    YoutubeDL.getInstance().init(reactContext)
    FFmpeg.getInstance().init(reactContext)
    engineReady = true
  }

  /**
   * The library ships yt-dlp 2025.11.12. YouTube now answers that build with
   * HTTP 403. Replace it with the nightly build when it is more than 14 days old.
   */
  private fun prepareYouTube(url: String) {
    if (!isYouTube(url) || extractorFresh) return
    val current = YoutubeDL.getInstance().versionName(reactContext).orEmpty()
    if (isStale(current)) {
      try {
        YoutubeDL.getInstance().updateYoutubeDL(reactContext, YoutubeDL.UpdateChannel.NIGHTLY)
      } catch (_: Exception) {
        // Keep the bundled copy. The download reports the YouTube error if it still fails.
      }
    }
    extractorFresh = true
  }

  private fun isYouTube(url: String): Boolean {
    val lower = url.lowercase()
    return lower.contains("youtube.com") || lower.contains("youtu.be")
  }

  private fun isStale(version: String): Boolean {
    val stamp = versionStamp(version)
    if (stamp.isEmpty()) return true
    val cutoff = java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.US).format(
      java.util.Date(System.currentTimeMillis() - 14L * 24 * 60 * 60 * 1000)
    )
    return stamp < cutoff
  }

  private fun versionStamp(version: String?): String {
    val match = Regex("(\\d{4})\\.(\\d{2})\\.(\\d{2})").find(version ?: "") ?: return ""
    return match.groupValues[1] + match.groupValues[2] + match.groupValues[3]
  }

  private fun open(url: String, headers: ReadableMap?): HttpURLConnection {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 30_000
    connection.readTimeout = 120_000
    connection.instanceFollowRedirects = true
    if (headers != null) {
      val iterator = headers.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        connection.setRequestProperty(key, headers.getString(key))
      }
    }
    return connection
  }

  private fun publishToMusic(file: File) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      MediaScannerConnection.scanFile(reactContext, arrayOf(file.absolutePath), null, null)
      return
    }
    try {
      val values = ContentValues().apply {
        put(MediaStore.Audio.Media.DISPLAY_NAME, file.name)
        put(MediaStore.Audio.Media.MIME_TYPE, mimeFor(file.name))
        put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/PK-Tunez")
        put(MediaStore.Audio.Media.IS_PENDING, 1)
      }
      val resolver = reactContext.contentResolver
      val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values) ?: return
      resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
      values.clear()
      values.put(MediaStore.Audio.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
    } catch (_: Exception) {
      MediaScannerConnection.scanFile(reactContext, arrayOf(file.absolutePath), null, null)
    }
  }

  private fun mimeFor(name: String): String {
    return when {
      name.endsWith(".mp3", true) -> "audio/mpeg"
      name.endsWith(".flac", true) -> "audio/flac"
      name.endsWith(".wav", true) -> "audio/wav"
      name.endsWith(".opus", true) -> "audio/opus"
      else -> "audio/mp4"
    }
  }

  private fun safeName(name: String): String {
    val cleaned = name.replace(Regex("[^A-Za-z0-9._-]"), "")
    return if (cleaned.isBlank()) "library.json" else cleaned
  }
}
