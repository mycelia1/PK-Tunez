import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { migrateLegacyUserData } from './migrateUserData'
import { shutdownDownloads } from './scdl'
import { startSyncHost, stopSyncHost } from './server/host'
import { loadSettings } from './settings'

const THEME_WINDOW_BG = {
  earthbound: '#4d8cff',
  dk64: '#2d6b3a'
} as const

const isDev = !app.isPackaged

app.setPath('userData', join(app.getPath('appData'), 'pk-tunez'))
migrateLegacyUserData()

function resolveIconPath(): string {
  const candidates = [
    join(__dirname, '../../assets/icons/icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'icon.png')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resolveIconPath())
  const sized = icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 })
  tray = new Tray(sized)
  tray.setToolTip('PK-Tunez')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open PK-Tunez', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showWindow())
}

function createWindow(): BrowserWindow {
  const iconPath = resolveIconPath()
  const theme = loadSettings().theme
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'PK-Tunez',
    backgroundColor: THEME_WINDOW_BG[theme] ?? THEME_WINDOW_BG.earthbound,
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

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow.hide()
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

  return mainWindow
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.pktunez.app')
  registerIpcHandlers()
  mainWindow = createWindow()
  createTray()
  void startSyncHost()

  app.on('activate', () => {
    showWindow()
  })
})

let isShuttingDown = false

// Stop downloads and the home server before the process exits.
// Closing the window only hides it, so this runs from the tray Quit item.
app.on('before-quit', (event) => {
  if (isShuttingDown) return
  event.preventDefault()
  isShuttingDown = true
  isQuitting = true
  void shutdownDownloads()
    .then(() => stopSyncHost())
    .finally(() => app.quit())
})
