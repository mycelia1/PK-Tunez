import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppSettings, DownloadRequest, ScdlEvent } from '../shared/types'

const api = {
  startDownload: (request: DownloadRequest) => ipcRenderer.invoke(IPC.START_DOWNLOAD, request),
  cancelDownload: () => ipcRenderer.invoke(IPC.CANCEL_DOWNLOAD),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
  getHistory: () => ipcRenderer.invoke(IPC.GET_HISTORY),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.PICK_FOLDER),
  pickArchiveFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.PICK_ARCHIVE_FILE),
  downloadArchiveFile: (
    sourcePath: string
  ): Promise<{ ok: boolean; error?: string; savedPath?: string; cancelled?: boolean }> =>
    ipcRenderer.invoke(IPC.DOWNLOAD_ARCHIVE_FILE, sourcePath),
  resolveAudioPath: (filePath: string): Promise<{ exists: boolean; resolvedPath: string }> =>
    ipcRenderer.invoke(IPC.RESOLVE_AUDIO_PATH, filePath),
  fileExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IPC.FILE_EXISTS, filePath),
  openInDefaultPlayer: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.OPEN_IN_DEFAULT_PLAYER, filePath),
  openFolder: (folderPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.OPEN_FOLDER, folderPath),
  onEvent: (callback: (event: ScdlEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScdlEvent) => callback(payload)
    ipcRenderer.on(IPC.EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('scdl', api)
