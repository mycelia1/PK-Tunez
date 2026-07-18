import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, DownloadMode, HistoryEntry, MixState, QueueItem, ScdlEvent, SessionSnapshot } from '../../shared/types'
import { DialogueBox } from './components/DialogueBox'
import { EbButton } from './components/EbButton'
import { ImpersonationTipModal } from './components/ImpersonationTipModal'
import { YouTubeCookiesHintModal } from './components/YouTubeCookiesHintModal'
import { MixBuilder } from './components/MixBuilder'
import { ModeConfirmModal } from './components/ModeConfirmModal'
import { Backpack } from './components/Backpack'
import { PsychicStream } from './components/PsychicStream'
import { PsychicSignalInput } from './components/PsychicSignalInput'
import { PsiMenu } from './components/PsiMenu'
import { SessionCompleteModal } from './components/SessionCompleteModal'
import { SessionLogPanel } from './components/SessionLogPanel'
import { TitlePanel } from './components/TitlePanel'
import { TutorialTour } from './components/TutorialTour'
import { ThemeProvider } from './theme/ThemeContext'
import { THEME_COPY, applyDocumentTheme } from './theme/themes'
import { initSound, playLoopingSessionComplete, playSound, stopLoopingSound, unlockAudio } from './utils/sound'
import { useCtrlCShortcut } from './utils/useCtrlCShortcut'
import { DEFAULT_DOWNLOAD_MODE, isBulkDownloadMode } from './constants/downloadModes'
import './App.css'

type CooldownEvent = Extract<ScdlEvent, { type: 'cooldown' }>

/** Render remaining seconds as a friendly "M:SS" (or "Ns" under a minute). */
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`
}

/** Build the live cooldown line shown in the dialogue box as the timer ticks. */
function cooldownMessage(event: CooldownEvent, remainingSeconds: number): string {
  const time = formatCountdown(remainingSeconds)
  if (event.reason === 'throttle') {
    const retry =
      event.attempt && event.maxAttempts ? ` (retry ${event.attempt}/${event.maxAttempts})` : ''
    return `\u26A0 SoundCloud rate limit hit — backing off. Resuming in ${time}${retry}`
  }
  const downloaded =
    typeof event.downloaded === 'number' ? ` (${event.downloaded} downloaded so far)` : ''
  return `Cooling down to avoid throttling — next batch in ${time}${downloaded}`
}

const defaultSettings: AppSettings = {
  clientId: '',
  authToken: '',
  downloadDir: '',
  archivePath: '',
  theme: 'earthbound',
  soundEnabled: true,
  limitTrackLength: true,
  maxTrackLengthMinutes: 60,
  impersonationTipShown: false,
  tutorialCompleted: false,
  chunkSize: 25,
  chunkCooldownSeconds: 120,
  maxThrottleRetries: 5,
  sleepIntervalSeconds: 3,
  maxSleepIntervalSeconds: 8,
  sleepRequestsSeconds: 1.5,
  limitRate: '',
  impersonateTarget: '',
  youtubeCookiesFromBrowser: false,
  youtubeCookiesBrowser: 'firefox',
  logsEnabled: false
}

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<DownloadMode>(DEFAULT_DOWNLOAD_MODE)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [draftSettings, setDraftSettings] = useState<AppSettings>(defaultSettings)
  const [statusMessage, setStatusMessage] = useState(THEME_COPY.earthbound.welcomeMessage)
  const [statusVariant, setStatusVariant] = useState<'info' | 'error' | 'success'>('info')
  const [isBusy, setIsBusy] = useState(false)
  const [psiOpen, setPsiOpen] = useState(false)
  /** Draft theme drives live preview; saved theme wins when the menu is closed. */
  const activeTheme = psiOpen ? draftSettings.theme : settings.theme
  const [sessionCompleteOpen, setSessionCompleteOpen] = useState(false)
  const [impersonationTipOpen, setImpersonationTipOpen] = useState(false)
  const [youtubeCookiesHintOpen, setYoutubeCookiesHintOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState<DownloadMode | null>(null)
  const [sessions, setSessions] = useState<SessionSnapshot[]>([])
  const [mixTrackIds, setMixTrackIds] = useState<Set<string>>(new Set())
  const [mixVersion, setMixVersion] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCooldownTimer = useCallback(() => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current)
      cooldownTimerRef.current = null
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    const items = await window.scdl.getHistory()
    setHistory(items)
  }, [])

  const refreshSessions = useCallback(async () => {
    const loaded = await window.scdl.getSessions()
    setSessions(loaded)
  }, [])

  const notifyMixUpdated = useCallback(async () => {
    const mix: MixState | null = await window.scdl.getMix()
    setMixTrackIds(new Set(mix?.tracks.map((track) => track.trackId) ?? []))
    setMixVersion((n) => n + 1)
  }, [])

  const setMixStatus = useCallback((message: string, variant: 'info' | 'success' | 'error') => {
    setStatusMessage(message)
    setStatusVariant(variant)
    if (variant === 'success') playSound('success')
    if (variant === 'error') playSound('error')
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
      await refreshSessions()
      await notifyMixUpdated()
      if (!loaded.tutorialCompleted) {
        setTutorialOpen(true)
      }
    })()
  }, [refreshHistory, refreshSessions, notifyMixUpdated])

  useEffect(() => {
    applyDocumentTheme(activeTheme)
    initSound({ enabled: settings.soundEnabled, theme: activeTheme })
  }, [activeTheme, settings.soundEnabled])

  useEffect(() => {
    // Refresh welcome line when theme changes and we're still on the default greeting.
    const welcomeMessages = Object.values(THEME_COPY).map((c) => c.welcomeMessage)
    if (welcomeMessages.includes(statusMessage)) {
      setStatusMessage(THEME_COPY[activeTheme].welcomeMessage)
    }
  }, [activeTheme, statusMessage])

  useEffect(() => {
    const unsubscribe = window.scdl.onEvent((event: ScdlEvent) => {
      // Any event other than a fresh cooldown means the wait is over (or the
      // session moved on), so stop any running countdown before handling it.
      if (event.type !== 'cooldown') {
        clearCooldownTimer()
      }
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
        case 'cooldown': {
          clearCooldownTimer()
          const cooldownEvent = event
          const endsAt = Date.now() + cooldownEvent.seconds * 1000
          const variant = cooldownEvent.reason === 'throttle' ? 'error' : 'info'
          const tick = (): void => {
            const remaining = (endsAt - Date.now()) / 1000
            if (remaining <= 0) {
              clearCooldownTimer()
              setStatusMessage(
                cooldownEvent.reason === 'throttle'
                  ? 'Backoff complete — resuming downloads...'
                  : 'Cooldown complete — starting next batch...'
              )
              setStatusVariant('info')
              return
            }
            setStatusMessage(cooldownMessage(cooldownEvent, remaining))
            setStatusVariant(variant)
          }
          tick()
          cooldownTimerRef.current = setInterval(tick, 500)
          break
        }
        case 'impersonation-warning':
          if (!tutorialOpen && !settings.impersonationTipShown) {
            setImpersonationTipOpen(true)
          }
          break
        case 'youtube-cookies-hint':
          if (!tutorialOpen) {
            setYoutubeCookiesHintOpen(true)
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
            const partial = /some issues/i.test(event.message)
            setStatusVariant(partial ? 'info' : 'success')
            // Refresh sessions first so the modal's partial warning sees this run's counts.
            void (async () => {
              await Promise.all([refreshHistory(), refreshSessions()])
              setSessionCompleteOpen(true)
              playLoopingSessionComplete()
            })()
          } else if (/cancel/i.test(event.message)) {
            setStatusVariant('info')
            void refreshHistory()
            void refreshSessions()
          } else {
            setStatusVariant('error')
            playSound('error')
            void refreshHistory()
            void refreshSessions()
          }
          break
        default:
          break
      }
    })

    return () => {
      unsubscribe()
      clearCooldownTimer()
    }
  }, [refreshHistory, refreshSessions, settings.impersonationTipShown, clearCooldownTimer, tutorialOpen])

  const handleDownload = async (): Promise<void> => {
    if (!url.trim()) return
    clearCooldownTimer()
    setIsBusy(true)
    setQueue([])
    setStatusMessage(THEME_COPY[activeTheme].downloadEngaged)
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
    clearCooldownTimer()
    await window.scdl.cancelDownload()
  }, [clearCooldownTimer])

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
    setStatusMessage(THEME_COPY[saved.theme].settingsSaved)
    setStatusVariant('success')
    playSound('success')
  }

  const handleDismissImpersonationTip = async (): Promise<void> => {
    setImpersonationTipOpen(false)
    const saved = await window.scdl.saveSettings({ impersonationTipShown: true })
    setSettings(saved)
    setDraftSettings((prev) => ({ ...prev, impersonationTipShown: true }))
  }

  const handleDismissYouTubeCookiesHint = (): void => {
    setYoutubeCookiesHintOpen(false)
  }

  const handleOpenPsiFromYouTubeHint = (): void => {
    setYoutubeCookiesHintOpen(false)
    setPsiOpen(true)
  }

  const completeTutorial = useCallback(async (): Promise<void> => {
    setTutorialOpen(false)
    setPsiOpen(false)
    const saved = await window.scdl.saveSettings({ tutorialCompleted: true })
    setSettings(saved)
    setDraftSettings((prev) => ({ ...prev, tutorialCompleted: true }))
  }, [])

  const handleTutorialFinish = (): void => {
    void completeTutorial()
  }

  const handleTutorialSkip = (): void => {
    void completeTutorial()
  }

  const handleRestartTutorial = (): void => {
    setDraftSettings(settings)
    setPsiOpen(false)
    setTutorialOpen(true)
    void (async () => {
      const saved = await window.scdl.saveSettings({ tutorialCompleted: false })
      setSettings(saved)
      setDraftSettings((prev) => ({ ...prev, tutorialCompleted: false }))
    })()
  }

  const handleTutorialPsiNeeded = useCallback((open: boolean): void => {
    if (open) {
      setDraftSettings(settings)
      setPsiOpen(true)
    } else {
      setDraftSettings(settings)
      setPsiOpen(false)
    }
  }, [settings])

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
    <ThemeProvider theme={activeTheme}>
      <div className="app-shell">
        <div className="app-shell__title" data-tour="title">
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
          <SessionLogPanel sessions={sessions} />
        </div>

        <div className="app-shell__queue">
          <MixBuilder
            mixVersion={mixVersion}
            onStatus={setMixStatus}
            onMixUpdated={() => void notifyMixUpdated()}
          />
          <PsychicStream items={queue} isBusy={isBusy} onCancel={() => void handleCancel()} />
        </div>

        <div className="app-shell__backpack">
          <Backpack items={history} mixTrackIds={mixTrackIds} onMixUpdated={() => void notifyMixUpdated()} />
        </div>

        <footer className="app-footer">
          <EbButton
            type="button"
            className="eb-button eb-button--secondary"
            data-tour="psi-open"
            onClick={() => setPsiOpen(true)}
          >
            {THEME_COPY[activeTheme].psiMenuOpen}
          </EbButton>
          <span className="app-footer__note">PK-Tunez • Global archive dedup • Thumb-drive friendly history</span>
        </footer>

        <PsiMenu
          open={psiOpen}
          settings={draftSettings}
          onClose={() => {
            setDraftSettings(settings)
            setPsiOpen(false)
          }}
          onChange={(partial) => setDraftSettings((prev) => ({ ...prev, ...partial }))}
          onSave={() => void handleSaveSettings()}
          onSetDownloadFolder={() => void handleSetDownloadFolder()}
          onSetArchiveFile={() => void handleSetArchiveFile()}
          onDownloadArchiveFile={() => void handleDownloadArchiveFile()}
          onRestartTutorial={handleRestartTutorial}
          suppressEnterSave={tutorialOpen}
        />

        <TutorialTour
          open={tutorialOpen}
          psiOpen={psiOpen}
          onFinish={handleTutorialFinish}
          onSkip={handleTutorialSkip}
          onPsiNeeded={handleTutorialPsiNeeded}
        />

        <SessionCompleteModal open={sessionCompleteOpen} onClose={closeSessionComplete} sessions={sessions} />

        <ModeConfirmModal
          open={modeConfirmOpen}
          pendingMode={pendingMode}
          currentMode={mode}
          onConfirm={confirmModeChange}
          onCancel={cancelModeChange}
        />

        <ImpersonationTipModal open={impersonationTipOpen} onDismiss={() => void handleDismissImpersonationTip()} />

        <YouTubeCookiesHintModal
          open={youtubeCookiesHintOpen}
          onDismiss={handleDismissYouTubeCookiesHint}
          onOpenPsiMenu={handleOpenPsiFromYouTubeHint}
        />
      </div>
    </ThemeProvider>
  )
}
