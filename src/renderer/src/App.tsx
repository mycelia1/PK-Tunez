import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, DownloadMode, HistoryEntry, QueueItem, ScdlEvent } from '../../shared/types'
import { DialogueBox } from './components/DialogueBox'
import { EbButton } from './components/EbButton'
import { ImpersonationTipModal } from './components/ImpersonationTipModal'
import { ModeConfirmModal } from './components/ModeConfirmModal'
import { Inventory } from './components/Inventory'
import { PartyRoster } from './components/PartyRoster'
import { PsychicSignalInput } from './components/PsychicSignalInput'
import { PsiMenu } from './components/PsiMenu'
import { SessionCompleteModal } from './components/SessionCompleteModal'
import { TitlePanel } from './components/TitlePanel'
import { initSound, playLoopingSessionComplete, playSound, stopLoopingSound, unlockAudio } from './utils/sound'
import { useCtrlCShortcut } from './utils/useCtrlCShortcut'
import { DEFAULT_DOWNLOAD_MODE, isBulkDownloadMode } from './constants/downloadModes'
import './App.css'

const defaultSettings: AppSettings = {
  clientId: '',
  authToken: '',
  downloadDir: '',
  archivePath: '',
  soundEnabled: true,
  limitTrackLength: true,
  maxTrackLengthMinutes: 60,
  impersonationTipShown: false,
  chunkSize: 25,
  chunkCooldownSeconds: 120,
  maxThrottleRetries: 5,
  sleepIntervalSeconds: 3,
  maxSleepIntervalSeconds: 8,
  sleepRequestsSeconds: 1.5,
  limitRate: '',
  impersonateTarget: ''
}

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<DownloadMode>(DEFAULT_DOWNLOAD_MODE)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [draftSettings, setDraftSettings] = useState<AppSettings>(defaultSettings)
  const [statusMessage, setStatusMessage] = useState('Welcome! Enter a SoundCloud psychic signal to begin.')
  const [statusVariant, setStatusVariant] = useState<'info' | 'error' | 'success'>('info')
  const [isBusy, setIsBusy] = useState(false)
  const [psiOpen, setPsiOpen] = useState(false)
  const [sessionCompleteOpen, setSessionCompleteOpen] = useState(false)
  const [impersonationTipOpen, setImpersonationTipOpen] = useState(false)
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState<DownloadMode | null>(null)

  const refreshHistory = useCallback(async () => {
    const items = await window.scdl.getHistory()
    setHistory(items)
  }, [])

  const closeSessionComplete = (): void => {
    stopLoopingSound()
    setSessionCompleteOpen(false)
  }

  useEffect(() => {
    void (async () => {
      const loaded = await window.scdl.getSettings()
      setSettings(loaded)
      setDraftSettings(loaded)
      await refreshHistory()
    })()
  }, [refreshHistory])

  useEffect(() => {
    initSound({ enabled: settings.soundEnabled })
  }, [settings.soundEnabled])

  useEffect(() => {
    const unsubscribe = window.scdl.onEvent((event: ScdlEvent) => {
      switch (event.type) {
        case 'status':
          setStatusMessage(event.message)
          setStatusVariant('info')
          break
        case 'queue':
          setQueue(event.items)
          break
        case 'track-start':
          playSound('start')
          break
        case 'track-complete':
          playSound('complete')
          void refreshHistory()
          break
        case 'track-skipped':
          playSound('blip')
          break
        case 'track-error':
          setStatusMessage(event.message)
          setStatusVariant('error')
          playSound('error')
          break
        case 'rate-limit':
          setStatusMessage(event.message)
          setStatusVariant('error')
          playSound('error')
          break
        case 'cooldown':
          setStatusMessage(event.message)
          setStatusVariant(event.reason === 'throttle' ? 'error' : 'info')
          break
        case 'impersonation-warning':
          if (!settings.impersonationTipShown) {
            setImpersonationTipOpen(true)
          }
          break
        case 'error':
          setStatusMessage(event.message)
          setStatusVariant('error')
          setIsBusy(false)
          playSound('error')
          break
        case 'done':
          setStatusMessage(event.message)
          setIsBusy(false)
          if (event.success) {
            setStatusVariant('success')
            setSessionCompleteOpen(true)
            playLoopingSessionComplete()
          } else if (/cancel/i.test(event.message)) {
            setStatusVariant('info')
          } else {
            setStatusVariant('error')
            playSound('error')
          }
          void refreshHistory()
          break
        default:
          break
      }
    })

    return unsubscribe
  }, [refreshHistory, settings.impersonationTipShown])

  const handleDownload = async (): Promise<void> => {
    if (!url.trim()) return
    setIsBusy(true)
    setQueue([])
    setStatusMessage('PK DOWNLOAD engaged! Scanning psychic signal...')
    setStatusVariant('info')
    playSound('confirm')
    unlockAudio()

    const result = await window.scdl.startDownload({ url: url.trim(), mode })
    if (!result.ok) {
      setIsBusy(false)
      setStatusMessage(result.error ?? 'Failed to start download.')
      setStatusVariant('error')
      playSound('error')
    }
  }

  const handleCancel = useCallback(async (): Promise<void> => {
    await window.scdl.cancelDownload()
    setIsBusy(false)
    setStatusMessage('Download cancelled.')
    setStatusVariant('info')
  }, [])

  useCtrlCShortcut(isBusy, () => {
    void handleCancel()
  })

  const handleModeChange = (nextMode: DownloadMode): void => {
    if (nextMode === mode) return

    if (isBulkDownloadMode(nextMode)) {
      setPendingMode(nextMode)
      setModeConfirmOpen(true)
      return
    }

    setMode(nextMode)
  }

  const confirmModeChange = (): void => {
    if (pendingMode) {
      setMode(pendingMode)
    }
    setModeConfirmOpen(false)
    setPendingMode(null)
  }

  const cancelModeChange = (): void => {
    setModeConfirmOpen(false)
    setPendingMode(null)
  }

  const handleSaveSettings = async (): Promise<void> => {
    const saved = await window.scdl.saveSettings(draftSettings)
    setSettings(saved)
    setDraftSettings(saved)
    setPsiOpen(false)
    setStatusMessage('PSI settings saved.')
    setStatusVariant('success')
    playSound('success')
  }

  const handleDismissImpersonationTip = async (): Promise<void> => {
    setImpersonationTipOpen(false)
    const saved = await window.scdl.saveSettings({ impersonationTipShown: true })
    setSettings(saved)
    setDraftSettings((prev) => ({ ...prev, impersonationTipShown: true }))
  }

  const handleSetDownloadFolder = async (): Promise<void> => {
    const picked = await window.scdl.pickFolder()
    if (picked) {
      setDraftSettings((prev) => ({ ...prev, downloadDir: picked }))
    }
  }

  const handleSetArchiveFile = async (): Promise<void> => {
    const picked = await window.scdl.pickArchiveFile()
    if (picked) {
      setDraftSettings((prev) => ({ ...prev, archivePath: picked }))
    }
  }

  const handleDownloadArchiveFile = async (): Promise<void> => {
    const archivePath = draftSettings.archivePath || settings.archivePath
    const result = await window.scdl.downloadArchiveFile(archivePath)
    if (result.cancelled) return
    if (!result.ok) {
      setStatusMessage(result.error ?? 'Could not save archive copy.')
      setStatusVariant('error')
      playSound('error')
      return
    }
    setStatusMessage(`Archive copy saved to ${result.savedPath ?? 'selected location'}.`)
    setStatusVariant('success')
    playSound('success')
  }

  return (
    <div className="app-shell">
      <div className="app-shell__title">
        <TitlePanel />
      </div>

      <div className="app-shell__input">
        <PsychicSignalInput
          url={url}
          mode={mode}
          isBusy={isBusy}
          onUrlChange={setUrl}
          onModeChange={handleModeChange}
          onDownload={() => void handleDownload()}
        />
        <DialogueBox message={statusMessage} variant={statusVariant} />
      </div>

      <div className="app-shell__queue">
        <PartyRoster items={queue} isBusy={isBusy} onCancel={() => void handleCancel()} />
      </div>

      <div className="app-shell__inventory">
        <Inventory items={history} />
      </div>

      <footer className="app-footer">
        <EbButton type="button" className="eb-button eb-button--secondary" onClick={() => setPsiOpen(true)}>
          Open PSI Menu
        </EbButton>
        <span className="app-footer__note">PK-Tunez • Global archive dedup • Thumb-drive friendly history</span>
      </footer>

      <PsiMenu
        open={psiOpen}
        settings={draftSettings}
        onClose={() => setPsiOpen(false)}
        onChange={(partial) => setDraftSettings((prev) => ({ ...prev, ...partial }))}
        onSave={() => void handleSaveSettings()}
        onSetDownloadFolder={() => void handleSetDownloadFolder()}
        onSetArchiveFile={() => void handleSetArchiveFile()}
        onDownloadArchiveFile={() => void handleDownloadArchiveFile()}
      />

      <SessionCompleteModal open={sessionCompleteOpen} onClose={closeSessionComplete} />

      <ModeConfirmModal
        open={modeConfirmOpen}
        pendingMode={pendingMode}
        currentMode={mode}
        onConfirm={confirmModeChange}
        onCancel={cancelModeChange}
      />

      <ImpersonationTipModal open={impersonationTipOpen} onDismiss={() => void handleDismissImpersonationTip()} />
    </div>
  )
}
