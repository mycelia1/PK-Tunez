import { useTheme } from '../theme/ThemeContext'
import './TitlePanel.css'

export function TitlePanel(): JSX.Element {
  const { copy, sprites } = useTheme()

  return (
    <header className="title-panel eb-panel eb-panel--sky">
      <img className="title-panel__logo" src={sprites.logo} alt="PK-Tunez logo" />
      <div>
        <p className="title-panel__eyebrow">{copy.titleEyebrow}</p>
        <h1 className="eb-title title-panel__title">PK-Tunez</h1>
        <p className="title-panel__subtitle">{copy.titleSubtitle}</p>
      </div>
    </header>
  )
}
