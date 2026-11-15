"use client"

import { useEffect, createContext, useContext, useState, useCallback } from "react"

type ColorTheme = "zinc" | "orange" | "blue" | "green" | "rose"
type Mode = "light" | "dark" | "system"

interface ThemeContextType {
  theme: ColorTheme
  mode: Mode
  setTheme: (theme: ColorTheme) => void
  setMode: (mode: Mode) => void
  resolvedMode: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "zinc",
  mode: "system",
  setTheme: () => {},
  setMode: () => {},
  resolvedMode: "light",
})

function getSystemMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyMode(mode: Mode) {
  const resolved = mode === "system" ? getSystemMode() : mode
  const root = document.documentElement
  if (resolved === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.setAttribute("data-theme", theme)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("closedui_theme") as ColorTheme | null) || "zinc"
    }
    return "zinc"
  })
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("closedui_mode") as Mode | null) || "system"
    }
    return "system"
  })
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
    }
    return false
  })
  const [mounted, setMounted] = useState(false)
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">(() => {
    return mode === "system" ? getSystemMode() : mode
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    applyMode(mode)

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const apiTheme = data.theme as ColorTheme || "zinc"
        const apiMode = (data.appearance as Mode) || "system"
        if (!localStorage.getItem("closedui_theme")) {
          setThemeState(apiTheme)
          applyTheme(apiTheme)
        }
        if (!localStorage.getItem("closedui_mode")) {
          setModeState(apiMode)
          applyMode(apiMode)
        }
      })
      .catch(() => {})

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches)
      if (localStorage.getItem("closedui_mode") === "system" || !localStorage.getItem("closedui_mode")) {
        applyMode("system")
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme, mode])

  const setTheme = useCallback((newTheme: ColorTheme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    localStorage.setItem("closedui_theme", newTheme)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    }).catch(() => {})
  }, [])

  const setMode = useCallback((newMode: Mode) => {
    setModeState(newMode)
    const resolved = newMode === "system" ? getSystemMode() : newMode
    setResolvedMode(resolved)
    applyMode(newMode)
    localStorage.setItem("closedui_mode", newMode)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appearance: newMode }),
    }).catch(() => {})
  }, [])

  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ theme: "zinc", mode: "system", setTheme, setMode, resolvedMode: "light" }}>
        <div style={{ visibility: 'hidden', display: 'contents' }}>{children}</div>
      </ThemeContext.Provider>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, resolvedMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
