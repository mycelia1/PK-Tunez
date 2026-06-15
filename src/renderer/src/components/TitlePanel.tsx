import logoUrl from '../assets/pktunez.png'
import './TitlePanel.css'

export function TitlePanel(): JSX.Element {
  return (
    <header className="title-panel eb-panel eb-panel--sky">
      <img className="title-panel__logo" src={logoUrl} alt="PK-Tunez logo" />
      <div>
        <p className="title-panel__eyebrow">SoundCloud Downloader Utility</p>
        <h1 className="eb-title title-panel__title">PK-Tunez</h1>
        <p className="title-panel__subtitle">Companion PC Program v1.0 • Onett Data Recovery Dept.</p>
      </div>
    </header>
  )
}
