"use client"

import { useState, useEffect, useCallback, createContext, useContext } from "react"

export interface ShortcutConfig {
  key: string
  category: string
  description: string
  macKey?: string
  action: () => void
  disabled?: boolean
}

interface ShortcutsContextType {
  shortcuts: ShortcutConfig[]
  registerShortcut: (shortcut: ShortcutConfig) => void
  unregisterShortcut: (key: string) => void
}

const ShortcutsContext = createContext<ShortcutsContextType>({
  shortcuts: [],
  registerShortcut: () => {},
  unregisterShortcut: () => {}
})

export function useShortcuts() {
  return useContext(ShortcutsContext)
}

export function ShortcutsProvider({ children, shortcuts: initialShortcuts }: {
  children: React.ReactNode
  shortcuts?: ShortcutConfig[]
}) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(initialShortcuts || [])

  const registerShortcut = useCallback((shortcut: ShortcutConfig) => {
    setShortcuts(prev => {
      const existing = prev.findIndex(s => s.key === shortcut.key)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = shortcut
        return updated
      }
      return [...prev, shortcut]
    })
  }, [])

  const unregisterShortcut = useCallback((key: string) => {
    setShortcuts(prev => prev.filter(s => s.key !== key))
  }, [])

  useEffect(() => {
    const handlers: Array<(e: KeyboardEvent) => void> = []

    shortcuts.forEach(shortcut => {
      if (shortcut.disabled) return

      const keys = shortcut.key.split("+").map(k => k.trim().toLowerCase())
      const modifierKeys = keys.filter(k => ["ctrl", "meta", "alt", "shift"].includes(k))
      const mainKey = keys.find(k => !["ctrl", "meta", "alt", "shift"].includes(k))

      if (!mainKey) return

      const handler = (e: KeyboardEvent) => {
        const hasModifiers = modifierKeys.every(mod => {
          if (mod === "ctrl" || mod === "meta") return e.ctrlKey || e.metaKey
          if (mod === "alt") return e.altKey
          if (mod === "shift") return e.shiftKey
          return false
        })

        if (hasModifiers && e.key && e.key.toLowerCase() === mainKey.toLowerCase()) {
          e.preventDefault()
          shortcut.action()
        }
      }

      document.addEventListener("keydown", handler)
      handlers.push(handler)
    })

    return () => {
      handlers.forEach(h => {
        document.removeEventListener("keydown", h)
      })
    }
  }, [shortcuts])

  return (
    <ShortcutsContext.Provider value={{ shortcuts, registerShortcut, unregisterShortcut }}>
      {children}
    </ShortcutsContext.Provider>
  )
}

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { shortcuts } = useShortcuts()
  const [filter, setFilter] = useState("")

  const categories = [...new Set(shortcuts.map(s => s.category))]
  const filtered = filter
    ? shortcuts.filter(s => s.category.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase()))
    : shortcuts

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-800 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">✕</button>
        </div>

        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search shortcuts..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
          {categories.map(category => {
            const categoryShortcuts = filtered.filter(s => s.category === category)
            if (categoryShortcuts.length === 0) return null

            return (
              <div key={category}>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{category}</h3>
                <div className="space-y-1">
                  {categoryShortcuts.map(shortcut => (
                    <div key={shortcut.key} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{shortcut.description}</span>
                      <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const defaultShortcuts: ShortcutConfig[] = [
  { key: "Ctrl+N", category: "General", description: "New chat", action: () => {} },
  { key: "Ctrl+Shift+K", category: "General", description: "Keyboard shortcuts", action: () => {} },
  { key: "Ctrl+/", category: "General", description: "Focus search", action: () => {} },
  { key: "Ctrl+Shift+N", category: "Documents", description: "New document", action: () => {} },
  { key: "Ctrl+S", category: "Documents", description: "Save document", action: () => {} },
  { key: "Ctrl+P", category: "Documents", description: "Print document", action: () => {} },
  { key: "Ctrl+F", category: "Documents", description: "Find and replace", action: () => {} },
  { key: "Ctrl+B", category: "Formatting", description: "Bold", action: () => {} },
  { key: "Ctrl+I", category: "Formatting", description: "Italic", action: () => {} },
  { key: "Ctrl+U", category: "Formatting", description: "Underline", action: () => {} },
  { key: "Ctrl+E", category: "Spreadsheet", description: "New spreadsheet", action: () => {} },
  { key: "Ctrl+Shift+O", category: "General", description: "Open OCR", action: () => {} },
  { key: "Escape", category: "General", description: "Close modal", action: () => {} }
]
