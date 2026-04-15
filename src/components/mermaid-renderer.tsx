"use client"

import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface MermaidRendererProps {
  code: string
}

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
  flowchart: { htmlLabels: true, useMaxWidth: true },
})

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return

      try {
        setError(null)
        // Generate a unique ID for each diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        
        // Use mermaid.render to get the SVG
        const { svg: renderedSvg } = await mermaid.render(id, code)
        setSvg(renderedSvg)
      } catch (err: any) {
        console.error('Mermaid rendering failed:', err)
        setError(err.message || 'Diagram rendering failed')
      }
    }

    renderDiagram()
  }, [code])

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-mono">
        <p className="font-bold mb-1">Mermaid Syntax Error:</p>
        <pre className="whitespace-pre-wrap">{error}</pre>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef} 
      className="mermaid-container flex justify-center py-4 bg-white dark:bg-zinc-900/50 rounded-lg overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg || '<div class="animate-pulse flex items-center gap-2 text-zinc-400 text-xs px-4">渲染图表中...</div>' }}
    />
  )
}
