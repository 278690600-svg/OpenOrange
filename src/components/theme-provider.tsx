"use client"

import { useEffect, createContext, useContext, useState } from "react"

const ThemeContext = createContext<{
  theme: string
  setTheme: (theme: string) => void
}>({
  theme: "zinc",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState("zinc")

  useEffect(() => {
    // Fetch initial theme from settings API
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const initialTheme = data.theme || "zinc"
        setThemeState(initialTheme)
        document.documentElement.setAttribute('data-theme', initialTheme)
      })
      .catch(console.error)
  }, [])

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
