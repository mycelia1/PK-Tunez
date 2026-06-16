import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync } from 'fs'
import { basename } from 'path'
import { cancelDownload, startDownload } from './scdl'
import { loadHistory } from './archive'
import { ensureArchiveFile, loadSettings, saveSettings } from './settings'
import { resolveAudioPath } from './resolveAudioPath'
import { IPC } from '../shared/ipc'
import type { AppSettings, DownloadRequest } from '../shared/types'

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
    return resolveAudioPath(filePath, loadSettings().downloadDir, trackId).exists
  })

  ipcMain.handle(IPC.RESOLVE_AUDIO_PATH, (_event, filePath: string, trackId?: string) => {
    return resolveAudioPath(filePath, loadSettings().downloadDir, trackId)
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
