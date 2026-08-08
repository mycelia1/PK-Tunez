import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  DownloadRequest,
  ImportMode,
  ImportResult,
  LibraryScanProgress,
  LibraryScanResult,
  MixLibrary,
  MixState,
  ResolvedAudioPath,
  ScdlEvent
} from '../shared/types'

const api = {
  platform: process.platform,
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
  resolveAudioPath: (filePath: string, trackId?: string): Promise<ResolvedAudioPath> =>
    ipcRenderer.invoke(IPC.RESOLVE_AUDIO_PATH, filePath, trackId),
  resolveAudioPaths: (
    items: Array<{ filePath: string; trackId?: string }>
  ): Promise<ResolvedAudioPath[]> => ipcRenderer.invoke(IPC.RESOLVE_AUDIO_PATHS, items),
  fileExists: (filePath: string, trackId?: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.FILE_EXISTS, filePath, trackId),
  openInDefaultPlayer: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.OPEN_IN_DEFAULT_PLAYER, filePath),
  openFolder: (folderPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.OPEN_FOLDER, folderPath),
  getSessions: () => ipcRenderer.invoke(IPC.GET_SESSIONS),
  getMixes: (): Promise<MixLibrary> => ipcRenderer.invoke(IPC.GET_MIXES),
  getMix: (mixId?: string): Promise<MixState | null> => ipcRenderer.invoke(IPC.GET_MIX, mixId),
  saveMix: (mix: MixState): Promise<MixState> => ipcRenderer.invoke(IPC.SAVE_MIX, mix),
  createMix: (name?: string): Promise<MixLibrary> => ipcRenderer.invoke(IPC.CREATE_MIX, name),
  deleteMix: (mixId: string): Promise<MixLibrary> => ipcRenderer.invoke(IPC.DELETE_MIX, mixId),
  setActiveMix: (mixId: string): Promise<MixLibrary> => ipcRenderer.invoke(IPC.SET_ACTIVE_MIX, mixId),
  openMixPlaylist: (mixId?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.OPEN_MIX_PLAYLIST, mixId),
  exportMix: (mixId?: string) => ipcRenderer.invoke(IPC.EXPORT_MIX, mixId),
  importTracks: (mode: ImportMode): Promise<ImportResult> =>
    ipcRenderer.invoke(IPC.IMPORT_TRACKS, mode),
  scanLibrary: (): Promise<LibraryScanResult> => ipcRenderer.invoke(IPC.SCAN_LIBRARY),
  onEvent: (callback: (event: ScdlEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScdlEvent) => callback(payload)
    ipcRenderer.on(IPC.EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT, listener)
  },
  onLibraryProgress: (callback: (progress: LibraryScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: LibraryScanProgress) =>
      callback(payload)
    ipcRenderer.on(IPC.LIBRARY_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.LIBRARY_PROGRESS, listener)
  }
}

contextBridge.exposeInMainWorld('scdl', api)
