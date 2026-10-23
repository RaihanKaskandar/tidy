export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'tidy.theme'

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

/** Applies a theme to the page and remembers it; `auto` follows the device. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Private mode: the choice just won't survive a reload.
  }
  // Keep the browser's own chrome (address bar, status bar) matching the page.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.dataset.scheme
    meta.media = theme === 'auto' ? `(prefers-color-scheme: ${scheme})` : theme === scheme ? 'all' : 'not all'
  }
}

export type Look = 'classic' | 'glass'

const LOOK_KEY = 'tidy.look'

export function loadLook(): Look {
  try {
    return localStorage.getItem(LOOK_KEY) === 'glass' ? 'glass' : 'classic'
  } catch {
    return 'classic'
  }
}

/** Switches between the flat classic look and the translucent glass look. */
export function applyLook(look: Look) {
  const root = document.documentElement
  if (look === 'glass') root.setAttribute('data-look', 'glass')
  else root.removeAttribute('data-look')
  try {
    if (look === 'glass') localStorage.setItem(LOOK_KEY, look)
    else localStorage.removeItem(LOOK_KEY)
  } catch {
    // Private mode: the choice just won't survive a reload.
  }
}
