import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { copyFileSync, existsSync } from 'fs'
import { basename } from 'path'
import { cancelDownload, isDownloadActive, startDownload } from './scdl'
import { loadHistory } from './archive'
import { ensureArchiveFile, loadSettings, saveSettings } from './settings'
import { resolveAudioPath, resolveAudioPaths } from './resolveAudioPath'
import { scanLibraryFolder } from './reconcileHistory'
import { importTracks } from './importTracks'
import { loadSessions } from './sessionLog'
import {
  createMixState,
  deleteMixState,
  exportMixCopy,
  getMixLibrary,
  getMixState,
  openMixPlaylist,
  saveMixState,
  setActiveMixState
} from './mixActions'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  DownloadRequest,
  ImportMode,
  LibraryScanProgress,
  MixState
} from '../shared/types'

function progressReporter(sender: WebContents): (progress: LibraryScanProgress) => void {
  return (progress) => {
    if (!sender.isDestroyed()) sender.send(IPC.LIBRARY_PROGRESS, progress)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.START_DOWNLOAD, (event, request: DownloadRequest) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { ok: false, error: 'No active window.' }
    }
    return startDownload(window, request)
  })

  ipcMain.handle(IPC.CANCEL_DOWNLOAD, () => {
    cancelDownload()
  })

  ipcMain.handle(IPC.GET_SETTINGS, () => loadSettings())

  ipcMain.handle(IPC.SAVE_SETTINGS, (_event, partial: Partial<AppSettings>) => saveSettings(partial))

  ipcMain.handle(IPC.GET_HISTORY, () => loadHistory())

  ipcMain.handle(IPC.GET_SESSIONS, () => loadSessions())

  ipcMain.handle(IPC.GET_MIXES, () => getMixLibrary())

  ipcMain.handle(IPC.GET_MIX, (_event, mixId?: string) => getMixState(mixId))

  ipcMain.handle(IPC.SAVE_MIX, (_event, mix: MixState) => saveMixState(mix))

  ipcMain.handle(IPC.CREATE_MIX, (_event, name?: string) => createMixState(name))

  ipcMain.handle(IPC.DELETE_MIX, (_event, mixId: string) => deleteMixState(mixId))

  ipcMain.handle(IPC.SET_ACTIVE_MIX, (_event, mixId: string) => setActiveMixState(mixId))

  ipcMain.handle(IPC.OPEN_MIX_PLAYLIST, (_event, mixId?: string) => openMixPlaylist(mixId))

  ipcMain.handle(IPC.EXPORT_MIX, (_event, mixId?: string) => exportMixCopy(mixId))

  ipcMain.handle(IPC.PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.PICK_ARCHIVE_FILE, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Set global archive file location',
      defaultPath: 'download-archive.txt',
      filters: [{ name: 'Text Archive', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) {
      return null
    }
    return result.filePath
  })

  ipcMain.handle(IPC.DOWNLOAD_ARCHIVE_FILE, async (_event, sourcePath: string) => {
    if (!sourcePath?.trim()) {
      return { ok: false, error: 'No archive file path set.' }
    }

    ensureArchiveFile(sourcePath)

    const result = await dialog.showSaveDialog({
      title: 'Save a copy of your global archive',
      defaultPath: basename(sourcePath),
      filters: [{ name: 'Text Archive', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, cancelled: true }
    }

    try {
      copyFileSync(sourcePath, result.filePath)
      return { ok: true, savedPath: result.filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save archive copy.'
      return { ok: false, error: message }
    }
  })
  ipcMain.handle(IPC.FILE_EXISTS, (_event, filePath: string, trackId?: string) => {
    if (!filePath?.trim() && !trackId?.trim()) return false
    return resolveAudioPath(filePath, trackId).exists
  })

  ipcMain.handle(IPC.RESOLVE_AUDIO_PATH, (_event, filePath: string, trackId?: string) => {
    return resolveAudioPath(filePath, trackId)
  })

  ipcMain.handle(
    IPC.RESOLVE_AUDIO_PATHS,
    (_event, items: Array<{ filePath: string; trackId?: string }>) => resolveAudioPaths(items)
  )

  // A download appends to history as tracks finish, while these rewrite the
  // whole file, so they are kept out of each other's way.
  const busyMessage = 'Wait for the current download to finish first.'

  ipcMain.handle(IPC.IMPORT_TRACKS, (event, mode: ImportMode) => {
    if (isDownloadActive()) {
      return { ok: false, added: 0, duplicates: 0, skippedMixes: 0, failed: 0, error: busyMessage }
    }
    return importTracks(mode === 'folder' ? 'folder' : 'files', progressReporter(event.sender))
  })

  ipcMain.handle(IPC.SCAN_LIBRARY, (event) => {
    if (isDownloadActive()) {
      return { ok: false, added: 0, relinked: 0, missing: 0, error: busyMessage }
    }
    return scanLibraryFolder(loadSettings().downloadDir, progressReporter(event.sender))
  })

  ipcMain.handle(IPC.OPEN_IN_DEFAULT_PLAYER, async (_event, filePath: string) => {
    if (!filePath?.trim() || !existsSync(filePath)) {
      return { ok: false, error: 'File not found.' }
    }
    const result = await shell.openPath(filePath)
    if (result) {
      return { ok: false, error: result }
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.OPEN_FOLDER, async (_event, folderPath: string) => {
    if (!folderPath?.trim()) {
      return { ok: false, error: 'No folder path set.' }
    }
    if (!existsSync(folderPath)) {
      return { ok: false, error: 'Folder not found.' }
    }
    const result = await shell.openPath(folderPath)
    if (result) {
      return { ok: false, error: result }
    }
    return { ok: true }
  })
}
