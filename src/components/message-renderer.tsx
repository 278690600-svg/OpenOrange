"use client"

import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ChevronDown, ChevronRight, Brain, Copy, Check, FileCode2 } from 'lucide-react'

interface MessageRendererProps {
  content: string
  role: 'user' | 'assistant'
  isStreaming?: boolean
  isThinking?: boolean
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') || 'text'
  const copy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="code-block-wrapper group">
      <div className="code-block-header">
        <div className="code-block-lang">
          <FileCode2 className="size-3.5" />
          <span>{language}</span>
        </div>
        <button onClick={copy} className="code-copy-btn">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre className="code-block-pre">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

function TableBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)

  const copyTable = () => {
    if (!tableRef.current) return
    const table = tableRef.current.querySelector('table')
    if (!table) return
    
    let text = ''
    const rows = table.querySelectorAll('tr')
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td')
      const rowText = Array.from(cells).map(cell => cell.textContent?.trim() || '').join('\t')
      text += rowText + '\n'
    })

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="table-block-wrapper group">
      <div className="table-wrapper app-scrollbar" ref={tableRef}>
        <table>{children}</table>
      </div>
      <button onClick={copyTable} className="element-copy-btn" title="复制表格">
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

function ThinkingBlock({ content, isActive }: { content: string; isActive?: boolean }) {
  const [expanded, setExpanded] = useState(isActive || false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive) setExpanded(true)
  }, [isActive])

  useEffect(() => {
    if (isActive && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, isActive])

  return (
    <div className={`thinking-block ${isActive ? 'thinking-active' : ''}`}>
      <button onClick={() => setExpanded(!expanded)} className="thinking-header">
        <div className="thinking-icon-wrapper">
          <Brain className={`size-4 ${isActive ? 'animate-pulse' : ''}`} />
        </div>
        <span className="thinking-label">
          {isActive ? '正在思考...' : '思考过程'}
        </span>
        {isActive && (
          <div className="thinking-dots">
            <div className="thinking-dot" style={{ animationDelay: '0s' }} />
            <div className="thinking-dot" style={{ animationDelay: '0.15s' }} />
            <div className="thinking-dot" style={{ animationDelay: '0.3s' }} />
          </div>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {expanded && (
        <div ref={contentRef} className="thinking-content app-scrollbar">
          {content || (isActive ? '思考中...' : '')}
        </div>
      )}
    </div>
  )
}

export function MessageRenderer({ content, role, isStreaming, isThinking }: MessageRendererProps) {
  const [msgCopied, setMsgCopied] = useState(false)

  const copyMessage = () => {
    const cleanToCopy = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    navigator.clipboard.writeText(cleanToCopy)
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 2000)
  }

  if (role === 'user') {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
  }

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g
  const thinkBlocks: string[] = []
  let cleanContent = content.replace(thinkRegex, (_, thinkContent) => {
    thinkBlocks.push(thinkContent.trim())
    return ''
  }).trim()

  const unclosedThinkMatch = cleanContent.match(/<think>([\s\S]*)$/)
  let activeThinkContent = ''
  if (unclosedThinkMatch) {
    activeThinkContent = unclosedThinkMatch[1].trim()
    cleanContent = cleanContent.replace(/<think>[\s\S]*$/, '').trim()
  }

  const showCursor = isStreaming && !isThinking && cleanContent.length > 0

  return (
    <div className="message-content group/msg relative">
      {thinkBlocks.map((t, i) => (
        <ThinkingBlock key={`done-${i}`} content={t} />
      ))}

      {(activeThinkContent || isThinking) && (
        <ThinkingBlock content={activeThinkContent} isActive={true} />
      )}

      {cleanContent && (
        <div className="prose-container">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight as any]}
            components={{
              pre: ({ children }) => <>{children}</>,
              code: ({ className, children }) => {
                const isBlock = className?.startsWith('language-')
                if (isBlock) {
                  return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>
                }
                return <code className="inline-code">{children}</code>
              },
              table: ({ children }) => <TableBlock>{children}</TableBlock>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="content-link">
                  {children}
                </a>
              ),
              blockquote: ({ children }) => (
                <blockquote className="content-blockquote">{children}</blockquote>
              ),
              h1: ({ children }) => <h1 className="content-h1">{children}</h1>,
              h2: ({ children }) => <h2 className="content-h2">{children}</h2>,
              h3: ({ children }) => <h3 className="content-h3">{children}</h3>,
              ul: ({ children }) => <ul className="content-ul">{children}</ul>,
              ol: ({ children }) => <ol className="content-ol">{children}</ol>,
              li: ({ children }) => <li className="content-li">{children}</li>,
              p: ({ children }) => <p className="content-p">{children}</p>,
              hr: () => <hr className="content-hr" />,
              strong: ({ children }) => <strong className="content-strong">{children}</strong>,
            }}
          >
            {cleanContent}
          </ReactMarkdown>
          {showCursor && <span className="streaming-cursor">▍</span>}
        </div>
      )}

      {!cleanContent && isStreaming && !isThinking && !activeThinkContent && (
        <span className="streaming-cursor">▍</span>
      )}

      {cleanContent && !isStreaming && (
        <button 
          onClick={copyMessage}
          className="absolute -bottom-2 -right-2 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-indigo-500 hover:border-indigo-500 transition-all opacity-0 group-hover/msg:opacity-100 shadow-sm z-20 backdrop-blur-sm"
          title="复制回答"
        >
          {msgCopied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        </button>
      )}
    </div>
  )
}
