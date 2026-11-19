package com.pktunez.mobile

import android.content.ClipData
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.database.ContentObserver
import android.database.Cursor
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class PkDownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val pool = Executors.newSingleThreadExecutor()
  @Volatile private var engineReady = false
  @Volatile private var extractorFresh = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private val notifyLibrary = Runnable {
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("pkLibraryChanged", null)
    } catch (_: Exception) {
      // The screen is gone. The next open reads the files again.
    }
  }
  private val musicObserver = object : ContentObserver(mainHandler) {
    override fun onChange(selfChange: Boolean) {
      mainHandler.removeCallbacks(notifyLibrary)
      mainHandler.postDelayed(notifyLibrary, 500)
    }
  }

  init {
    reactContext.contentResolver.registerContentObserver(
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      true,
      musicObserver
    )
  }

  override fun invalidate() {
    mainHandler.removeCallbacks(notifyLibrary)
    reactContext.contentResolver.unregisterContentObserver(musicObserver)
    super.invalidate()
  }

  override fun getName(): String = NAME

  companion object {
    const val NAME = "PkDownload"
    private const val MUSIC_FOLDER = "Music/PK-Tunez/"
    private val trashedPrefix = Regex("^\\.trashed-\\d+-", RegexOption.IGNORE_CASE)
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun deviceName(promise: Promise) {
    val fromSettings = try {
      Settings.Global.getString(reactContext.contentResolver, "device_name")?.trim().orEmpty()
    } catch (_: RuntimeException) {
      ""
    }
    if (fromSettings.isNotEmpty()) {
      promise.resolve(fromSettings)
      return
    }
    promise.resolve(Build.MODEL?.trim().orEmpty().ifBlank { "Phone" })
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
        val useMediaStore = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val dir = if (useMediaStore) File(reactContext.cacheDir, "pk-download") else File(outputDir)
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
        val result = Arguments.createArray()
        created.forEach { path ->
          val file = File(path)
          try {
            val stored = if (useMediaStore) saveToMusic(file) else path
            val item = Arguments.createMap()
            item.putString("path", stored)
            item.putString("fileName", file.name)
            result.pushMap(item)
          } finally {
            if (useMediaStore) file.delete()
          }
        }
        if (useMediaStore) dir.listFiles()?.forEach { it.delete() }
        else MediaScannerConnection.scanFile(reactContext, created.toTypedArray(), null, null)
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
        val useMediaStore = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val file = if (useMediaStore) {
          val tempDir = File(reactContext.cacheDir, "pk-download")
          if (!tempDir.exists()) tempDir.mkdirs()
          File(tempDir, File(dest).name.ifBlank { "track.m4a" })
        } else {
          File(dest).also { it.parentFile?.mkdirs() }
        }
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
        if (!useMediaStore) {
          MediaScannerConnection.scanFile(reactContext, arrayOf(file.absolutePath), null, null)
          promise.resolve(file.absolutePath)
          return@execute
        }
        val stored = saveToMusic(file)
        file.delete()
        promise.resolve(stored)
      } catch (error: Exception) {
        promise.reject("download_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun relocateTracks(paths: ReadableArray, promise: Promise) {
    pool.execute {
      try {
        val result = Arguments.createArray()
        for (index in 0 until paths.size()) {
          val stored = relocate(paths.getString(index) ?: "")
          if (stored == null) result.pushNull() else result.pushString(stored)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("relocate_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun openFile(filePath: String, promise: Promise) {
    try {
      val uri = if (filePath.startsWith("content:")) {
        val parsed = Uri.parse(filePath)
        val status = statusOf(parsed)
        if (status == null || status.trashed) {
          if (status?.trashed == true) deleteOwned(status.uri)
          promise.reject("open_failed", "File not found.")
          return
        }
        parsed
      } else {
        val file = File(filePath)
        if (!file.isFile) {
          promise.reject("open_failed", "File not found.")
          return
        }
        FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.fileprovider", file)
      }
      val mime = reactContext.contentResolver.getType(uri) ?: mimeFor(filePath)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mime)
        clipData = ClipData.newRawUri("", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("open_failed", error.message, error)
    }
  }

  @ReactMethod
  fun uploadFile(url: String, headers: ReadableMap, filePath: String, promise: Promise) {
    pool.execute {
      try {
        val input = openLocal(filePath)
        if (input == null) {
          promise.reject("upload_failed", "File not found.")
          return@execute
        }
        val connection = open(url, headers)
        connection.requestMethod = "POST"
        connection.doOutput = true
        val size = localSize(filePath)
        if (size >= 0) connection.setFixedLengthStreamingMode(size)
        connection.outputStream.use { out -> input.use { it.copyTo(out) } }
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

  private fun openLocal(filePath: String): java.io.InputStream? {
    if (!filePath.startsWith("content:")) {
      val file = File(filePath)
      return if (file.isFile) file.inputStream() else null
    }
    return reactContext.contentResolver.openInputStream(Uri.parse(filePath))
  }

  private fun localSize(filePath: String): Long {
    if (!filePath.startsWith("content:")) return File(filePath).length()
    reactContext.contentResolver.openFileDescriptor(Uri.parse(filePath), "r")?.use { return it.statSize }
    return -1
  }

  /** One copy in Music/PK-Tunez. A trashed copy counts as deleted. */
  private fun relocate(filePath: String): String? {
    if (filePath.isBlank()) return null
    if (filePath.startsWith("content:")) {
      val status = statusOf(Uri.parse(filePath)) ?: return null
      if (!status.trashed) return status.uri.toString()
      deleteOwned(status.uri)
      return null
    }
    val file = File(filePath)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return if (file.isFile) file.absolutePath else null
    val rows = musicRows() ?: return if (file.isFile) file.absolutePath else null
    val matches = rows.filter { namesMatch(it.displayName, file.name) }
    val live = matches.firstOrNull { !it.trashed }
    matches.filter { it.trashed }.forEach { deleteOwned(it.uri) }
    if (live != null) {
      if (file.isFile) file.delete()
      return live.uri.toString()
    }
    if (matches.isNotEmpty()) {
      if (file.isFile) file.delete()
      return null
    }
    if (!file.isFile) return null
    val stored = saveToMusic(file)
    file.delete()
    return stored
  }

  private fun saveToMusic(file: File): String {
    val name = uniqueDisplayName(file.name)
    val values = ContentValues().apply {
      put(MediaStore.Audio.Media.DISPLAY_NAME, name)
      put(MediaStore.Audio.Media.MIME_TYPE, mimeFor(file.name))
      put(MediaStore.Audio.Media.RELATIVE_PATH, MUSIC_FOLDER)
      put(MediaStore.Audio.Media.IS_MUSIC, 1)
      put(MediaStore.Audio.Media.IS_PENDING, 1)
    }
    val resolver = reactContext.contentResolver
    val uri = resolver.insert(audioCollection(), values) ?: throw IOException("Could not save $name.")
    try {
      resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
        ?: throw IOException("Could not write $name.")
      val done = ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }
      resolver.update(uri, done, null, null)
    } catch (error: Exception) {
      resolver.delete(uri, null, null)
      throw error
    }
    return uri.toString()
  }

  private fun uniqueDisplayName(fileName: String): String {
    val used = musicRows().orEmpty().filter { !it.trashed }.map { it.displayName }.toSet()
    if (!used.contains(fileName)) return fileName
    val dot = fileName.lastIndexOf('.')
    val stem = if (dot > 0) fileName.substring(0, dot) else fileName
    val ext = if (dot > 0) fileName.substring(dot) else ""
    var number = 2
    while (used.contains("$stem ($number)$ext")) number += 1
    return "$stem ($number)$ext"
  }

  private fun namesMatch(displayName: String, fileName: String): Boolean {
    val original = displayName.replace(trashedPrefix, "")
    return original.equals(fileName, ignoreCase = true)
  }

  private fun deleteOwned(uri: Uri) {
    try {
      reactContext.contentResolver.delete(uri, null, null)
    } catch (_: SecurityException) {
      // Another app owns this file. The list entry still goes away.
    }
  }

  private data class MusicRow(val uri: Uri, val displayName: String, val trashed: Boolean)

  private fun audioCollection(): Uri {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    } else {
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    }
  }

  private fun audioProjection(): Array<String> {
    val columns = mutableListOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME)
    if (Build.VERSION.SDK_INT >= 30) columns.add(MediaStore.MediaColumns.IS_TRASHED)
    return columns.toTypedArray()
  }

  private fun statusOf(uri: Uri): MusicRow? {
    rowFrom(queryUri(uri, null), uri)?.let { return it }
    if (Build.VERSION.SDK_INT >= 30) return rowFrom(queryUri(uri, MediaStore.MATCH_ONLY), uri)
    return null
  }

  private fun queryUri(uri: Uri, matchTrashed: Int?): Cursor? {
    return try {
      if (matchTrashed != null && Build.VERSION.SDK_INT >= 30) {
        val args = Bundle().apply { putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, matchTrashed) }
        reactContext.contentResolver.query(uri, audioProjection(), args, null)
      } else {
        reactContext.contentResolver.query(uri, audioProjection(), null, null, null)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun rowFrom(cursor: Cursor?, uri: Uri): MusicRow? {
    cursor?.use {
      if (!it.moveToFirst()) return null
      val name = it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)) ?: return null
      val trashIndex = it.getColumnIndex(MediaStore.MediaColumns.IS_TRASHED)
      val trashed = trashIndex >= 0 && it.getInt(trashIndex) == 1
      return MusicRow(uri, name, trashed)
    }
    return null
  }

  private fun musicRows(): List<MusicRow>? {
    return try {
      val projection = audioProjection()
      val selection =
        "${MediaStore.Audio.Media.RELATIVE_PATH} = ? OR ${MediaStore.Audio.Media.RELATIVE_PATH} = ?"
      val args = arrayOf(MUSIC_FOLDER, "Music/PK-Tunez")
      val cursor = if (Build.VERSION.SDK_INT >= 30) {
        val query = Bundle().apply {
          putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_INCLUDE)
          putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
          putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
        }
        reactContext.contentResolver.query(audioCollection(), projection, query, null)
      } else {
        reactContext.contentResolver.query(audioCollection(), projection, selection, args, null)
      } ?: return emptyList()
      cursor.use { readRows(it) }
    } catch (_: Exception) {
      null
    }
  }

  private fun readRows(cursor: Cursor): List<MusicRow> {
    val rows = mutableListOf<MusicRow>()
    val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
    val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
    val trashIndex = cursor.getColumnIndex(MediaStore.MediaColumns.IS_TRASHED)
    while (cursor.moveToNext()) {
      val name = cursor.getString(nameIndex) ?: continue
      val uri = ContentUris.withAppendedId(audioCollection(), cursor.getLong(idIndex))
      val trashed = trashIndex >= 0 && cursor.getInt(trashIndex) == 1
      rows.add(MusicRow(uri, name, trashed))
    }
    return rows
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
