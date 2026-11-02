'use client'
// ─────────────────────────────────────────────────────────────────────────────
//  ThemeProvider — persists the day/night preference per device.
//
//  Visual-only infrastructure. It just toggles data-theme on <html>; every
//  color token in globals.css + Tailwind config reads from CSS variables, so
//  no other component needs any code change for the theme to swap live.
//
//  Default is NIGHT (ops) — matches the previous dark UI and keeps the screen
//  from lighting up operators in the field. localStorage key: `magav-theme`.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export type Theme = 'dark' | 'light'
const STORAGE_KEY = 'magav-theme'
const DEFAULT_THEME: Theme = 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  toggle: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with DEFAULT_THEME on both server and first client paint to avoid
  // a hydration mismatch; real preference is applied in an effect right after.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved)
        document.documentElement.setAttribute('data-theme', saved)
      } else {
        document.documentElement.setAttribute('data-theme', DEFAULT_THEME)
      }
    } catch {
      document.documentElement.setAttribute('data-theme', DEFAULT_THEME)
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }

// ─────────────────────────────────────────────────────────────────────────────
//  ThemeToggle — a 48×48 glove-friendly button that can be dropped into any
//  header. Icon-only to save header real estate; aria-label gives the
//  Hebrew name for screen-readers.
// ─────────────────────────────────────────────────────────────────────────────
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'עבור למצב יום' : 'עבור למצב לילה'}
      title={isDark ? 'מצב יום' : 'מצב לילה'}
      className={
        /* 48×48 on mobile (touch-friendly with gloves) and 40×40 on sm+ screens where cursor precision is higher. */
        'inline-flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 rounded-xl ' +
        'border border-hairline bg-surface hover:bg-surface-2 active:scale-95 ' +
        'text-ink transition-all shrink-0 ' +
        'focus-visible:ring-2 focus-visible:ring-brand ' +
        className
      }
    >
      {isDark ? (
        /* Sun icon — switch to day */
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      ) : (
        /* Moon icon — switch to night */
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
