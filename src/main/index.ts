import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { migrateLegacyUserData } from './migrateUserData'
import { downloadsBusy, shutdownDownloads } from './scdl'

const isDev = !app.isPackaged

app.setPath('userData', join(app.getPath('appData'), 'pk-tunez'))
migrateLegacyUserData()

function resolveIconPath(): string {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'icon.png')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function createWindow(): void {
  const iconPath = resolveIconPath()
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'PK-Tunez',
    backgroundColor: '#4d8cff',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.pktunez.app')
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let isShuttingDown = false

// Kill any in-progress download and sweep leftover .part files before quitting,
// so closing the app never orphans the scdl process or leaves partial files.
app.on('before-quit', (event) => {
  if (isShuttingDown || !downloadsBusy()) return
  event.preventDefault()
  isShuttingDown = true
  void shutdownDownloads().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
