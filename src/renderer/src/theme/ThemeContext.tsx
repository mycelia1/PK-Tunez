import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { UiTheme } from '../../../shared/types'
import { THEME_COPY, THEME_SPRITES, type ThemeCopy, type ThemeSprites } from './themes'

interface ThemeContextValue {
  theme: UiTheme
  copy: ThemeCopy
  sprites: ThemeSprites
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  theme: UiTheme
  children: ReactNode
}

export function ThemeProvider({ theme, children }: ThemeProviderProps): JSX.Element {
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      copy: THEME_COPY[theme],
      sprites: THEME_SPRITES[theme]
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
