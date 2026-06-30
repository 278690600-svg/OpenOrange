"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react'

export interface ArtifactFile {
  name: string
  language: string
  content: string
}

export interface Artifact {
  id: string
  language: string
  code: string
  title?: string
  files?: ArtifactFile[]
}

export const ArtifactStateContext = createContext<Artifact | null>(null)
const ArtifactActionsContext = createContext<{
  setActiveArtifact: (artifact: Artifact | null) => void
} | undefined>(undefined)

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)

  const actions = React.useMemo(() => ({ setActiveArtifact }), [setActiveArtifact])

  return (
    <ArtifactStateContext.Provider value={activeArtifact}>
      <ArtifactActionsContext.Provider value={actions}>
        {children}
      </ArtifactActionsContext.Provider>
    </ArtifactStateContext.Provider>
  )
}

export function useArtifact() {
  const activeArtifact = useContext(ArtifactStateContext)
  const context = useContext(ArtifactActionsContext)
  if (!context) throw new Error('useArtifact must be used within ArtifactProvider')
  return { activeArtifact, ...context }
}

export function useArtifactState() {
  return useContext(ArtifactStateContext)
}

export function useArtifactActions() {
  const context = useContext(ArtifactActionsContext)
  if (!context) throw new Error('useArtifactActions must be used within ArtifactProvider')
  return context
}
