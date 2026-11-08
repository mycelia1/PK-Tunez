import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { PairingTicket, ServerStatus } from '../../../shared/serverProtocol'
import { EbButton } from './EbButton'

interface ServerPanelProps {
  settings: AppSettings
  onChange: (partial: Partial<AppSettings>) => void
}

export function ServerPanel({ settings, onChange }: ServerPanelProps): JSX.Element {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [pairing, setPairing] = useState<PairingTicket | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let stop = false
    const tick = (): void => {
      void window.scdl.getServerStatus().then((next) => {
        if (!stop) setStatus(next)
      })
    }
    tick()
    const timer = setInterval(tick, 3000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

  const createCode = async (): Promise<void> => {
    const result = await window.scdl.createPairing()
    if ('error' in result) {
      setPairing(null)
      setMessage(result.error)
      return
    }
    setPairing(result)
    setMessage('This code works for 10 minutes. The phone uses it once.')
  }

  const revoke = async (id: string): Promise<void> => {
    const next = await window.scdl.revokeDevice(id)
    setStatus(next)
  }

  const runningText = status?.running ? `Running on port ${status.port}.` : 'Not running.'

  return (
    <section className="psi-menu__field">
      <span className="eb-label">Home server</span>
      <label className="psi-menu__toggle">
        <input
          type="checkbox"
          checked={settings.serverEnabled}
          onChange={(event) => onChange({ serverEnabled: event.target.checked })}
        />
        <span>Run the server while PK-Tunez is open</span>
      </label>
      <label className="psi-menu__field">
        <span className="eb-label">Port</span>
        <input
          className="eb-input"
          type="number"
          min={1}
          max={65535}
          value={settings.serverPort}
          onChange={(event) => onChange({ serverPort: Number(event.target.value) })}
        />
      </label>
      <small className="psi-menu__help">
        {runningText} Save PSI Settings to apply a change. Closing the window keeps the server on.
        Quit from the tray icon to stop it.
      </small>
      {status?.error ? <small className="psi-menu__help">{status.error}</small> : null}
      {status?.lanUrls.length ? (
        <small className="psi-menu__help">On this network: {status.lanUrls.join(', ')}</small>
      ) : null}

      <label className="psi-menu__toggle">
        <input
          type="checkbox"
          checked={settings.tunnelEnabled}
          onChange={(event) => onChange({ tunnelEnabled: event.target.checked })}
        />
        <span>Allow phones away from home (cloudflared)</span>
      </label>
      <label className="psi-menu__field">
        <span className="eb-label">Cloudflare tunnel token</span>
        <input
          className="eb-input"
          type="password"
          value={settings.tunnelToken}
          placeholder="empty = temporary address"
          autoComplete="off"
          onChange={(event) => onChange({ tunnelToken: event.target.value })}
        />
      </label>
      <label className="psi-menu__field">
        <span className="eb-label">Tunnel host name</span>
        <input
          className="eb-input"
          type="text"
          value={settings.tunnelHostname}
          placeholder="home.example.com"
          onChange={(event) => onChange({ tunnelHostname: event.target.value })}
        />
        <small className="psi-menu__help">
          Leave the token empty for a temporary address. A token needs the host name you set in
          Cloudflare.
        </small>
      </label>
      {settings.tunnelEnabled && status?.tunnelUrl ? (
        <small className="psi-menu__help">Away from home: {status.tunnelUrl}</small>
      ) : null}
      {settings.tunnelEnabled && !status?.tunnelUrl && !status?.tunnelError ? (
        <small className="psi-menu__help">Opening the tunnel...</small>
      ) : null}
      {status?.tunnelError ? <small className="psi-menu__help">{status.tunnelError}</small> : null}

      <EbButton type="button" className="eb-button eb-button--secondary" onClick={() => void createCode()}>
        Create pairing code
      </EbButton>
      {message ? <small className="psi-menu__help">{message}</small> : null}
      {pairing ? (
        <div className="psi-menu__pair">
          <img src={pairing.qrDataUrl} alt="Pairing code" width={180} height={180} />
          <strong className="psi-menu__code">{pairing.code}</strong>
        </div>
      ) : null}

      {status && status.devices.length > 0 ? (
        <ul className="psi-menu__devices">
          {status.devices.map((device) => (
            <li key={device.id}>
              <span>{device.name}</span>
              <EbButton
                type="button"
                className="eb-button eb-button--secondary"
                onClick={() => void revoke(device.id)}
              >
                Remove
              </EbButton>
            </li>
          ))}
        </ul>
      ) : (
        <small className="psi-menu__help">No phone is paired yet.</small>
      )}
    </section>
  )
}
