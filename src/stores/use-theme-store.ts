import { create } from "zustand"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"
export type UiStyle = "standard" | "8bit"

const STORAGE_KEY = "theme"
const UI_STYLE_STORAGE_KEY = "ui-style"

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "system"
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved
    }
  } catch {
    // localStorage may be unavailable (private mode)
  }
  return "system"
}

const resolveTheme = (theme: Theme): ResolvedTheme => {
  return theme === "system" ? getSystemTheme() : theme
}

const getInitialUiStyle = (): UiStyle => {
  if (typeof window === "undefined") return "standard"
  try {
    const saved = localStorage.getItem(UI_STYLE_STORAGE_KEY)
    if (saved === "standard" || saved === "8bit") {
      return saved
    }
  } catch {
    // localStorage may be unavailable (private mode)
  }
  return "standard"
}

const applyThemeToDOM = (resolved: ResolvedTheme) => {
  if (typeof window === "undefined") return
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved

  const themeColor = resolved === "dark" ? "#09090b" : "#ffffff"
  let metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (!metaThemeColor) {
    metaThemeColor = document.createElement("meta")
    metaThemeColor.setAttribute("name", "theme-color")
    document.head.appendChild(metaThemeColor)
  }
  metaThemeColor.setAttribute("content", themeColor)
}

// The class lives on <html> next to light/dark; .theme-8bit CSS blocks then
// restyle the whole app. Light/dark classes are managed independently.
const applyUiStyleToDOM = (uiStyle: UiStyle) => {
  if (typeof window === "undefined") return
  document.documentElement.classList.toggle("theme-8bit", uiStyle === "8bit")
}

// Immediate synchronous execution when the JS script loads
const initialTheme = getInitialTheme()
const initialResolved = resolveTheme(initialTheme)
applyThemeToDOM(initialResolved)

const initialUiStyle = getInitialUiStyle()
applyUiStyleToDOM(initialUiStyle)

interface ThemeState {
  theme: Theme
  resolvedTheme: ResolvedTheme
  uiStyle: UiStyle
  setTheme: (theme: Theme) => void
  setUiStyle: (uiStyle: UiStyle) => void
  initThemeListener: () => () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  resolvedTheme: initialResolved,
  uiStyle: initialUiStyle,
  setTheme: (theme: Theme) => {
    const resolved = resolveTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage may be unavailable (private mode)
    }
    applyThemeToDOM(resolved)
    set({ theme, resolvedTheme: resolved })
  },
  setUiStyle: (uiStyle: UiStyle) => {
    try {
      localStorage.setItem(UI_STYLE_STORAGE_KEY, uiStyle)
    } catch {
      // localStorage may be unavailable (private mode)
    }
    applyUiStyleToDOM(uiStyle)
    set({ uiStyle })
  },
  initThemeListener: () => {
    if (typeof window === "undefined") return () => undefined

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (get().theme === "system") {
        const resolved = getSystemTheme()
        applyThemeToDOM(resolved)
        set({ resolvedTheme: resolved })
      }
    }

    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  },
}))
