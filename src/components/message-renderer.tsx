"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  ChevronDown, ChevronRight, Brain, Copy, Check, FileCode2,
  Play, Code, Download, Maximize2, Minimize2, WrapText,
  Terminal, Globe, Braces, FileJson, Hash
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MessageRendererProps {
  content: string
  role: 'user' | 'assistant'
  isStreaming?: boolean
  isThinking?: boolean
}

// 语言 -> 图标 / 颜色映射
const LANG_META: Record<string, { icon: React.ReactNode; color: string; ext: string }> = {
  html:       { icon: <Globe className="size-3.5" />,     color: '#E44D26', ext: 'html' },
  css:        { icon: <Hash className="size-3.5" />,      color: '#264DE4', ext: 'css'  },
  javascript: { icon: <Braces className="size-3.5" />,    color: '#F7DF1E', ext: 'js'   },
  js:         { icon: <Braces className="size-3.5" />,    color: '#F7DF1E', ext: 'js'   },
  typescript: { icon: <Braces className="size-3.5" />,    color: '#3178C6', ext: 'ts'   },
  ts:         { icon: <Braces className="size-3.5" />,    color: '#3178C6', ext: 'ts'   },
  jsx:        { icon: <Braces className="size-3.5" />,    color: '#61DAFB', ext: 'jsx'  },
  tsx:        { icon: <Braces className="size-3.5" />,    color: '#61DAFB', ext: 'tsx'  },
  json:       { icon: <FileJson className="size-3.5" />,  color: '#CBCB41', ext: 'json' },
  python:     { icon: <Terminal className="size-3.5" />,  color: '#3572A5', ext: 'py'   },
  py:         { icon: <Terminal className="size-3.5" />,  color: '#3572A5', ext: 'py'   },
  bash:       { icon: <Terminal className="size-3.5" />,  color: '#89E051', ext: 'sh'   },
  shell:      { icon: <Terminal className="size-3.5" />,  color: '#89E051', ext: 'sh'   },
  sh:         { icon: <Terminal className="size-3.5" />,  color: '#89E051', ext: 'sh'   },
  sql:        { icon: <FileCode2 className="size-3.5" />, color: '#E38C00', ext: 'sql'  },
  svg:        { icon: <Globe className="size-3.5" />,     color: '#FFB13B', ext: 'svg'  },
}
const PREVIEWABLE = ['html', 'svg']

// 标准化语言名到 Prism
function normLang(lang: string) {
  const map: Record<string, string> = {
    react: 'jsx', tsx: 'tsx', ts: 'typescript', js: 'javascript',
    py: 'python', sh: 'bash', shell: 'bash',
  }
  return map[lang] ?? lang
}

// 下载文件
function downloadCode(code: string, lang: string) {
  const meta = LANG_META[lang]
  const ext  = meta?.ext ?? 'txt'
  const blob = new Blob([code], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `code.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

// 全屏浮层
function FullscreenPreview({ code, onClose }: { code: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
      style={{ animation: 'fadeIn .15s ease' }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-zinc-800 text-zinc-200 text-xs">
        <div className="flex items-center gap-2">
          <Globe className="size-3.5 text-indigo-400" />
          <span className="font-mono">实时预览</span>
          <span className="text-zinc-500 ml-2">按 ESC 退出全屏</span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-700"
        >
          <Minimize2 className="size-3.5" /> 退出全屏
        </button>
      </div>
      <iframe
        srcDoc={code}
        className="flex-1 w-full border-0 bg-white"
        sandbox="allow-scripts allow-modals allow-forms allow-popups"
        title="Fullscreen Preview"
      />
    </div>
  )
}

// 行号渲染定制
const lineNumberStyle: React.CSSProperties = {
  minWidth: '2.8em',
  paddingRight: '1em',
  color: '#4b5563',
  userSelect: 'none',
  textAlign: 'right',
  borderRight: '1px solid #374151',
  marginRight: '1em',
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied,      setCopied]      = useState(false)
  const [viewMode,    setViewMode]    = useState<'code' | 'preview'>('code')
  const [collapsed,   setCollapsed]   = useState(false)
  const [wordWrap,    setWordWrap]    = useState(false)
  const [fullscreen,  setFullscreen]  = useState(false)

  const language   = className?.replace('language-', '') ?? 'text'
  const meta       = LANG_META[language]
  const isWebCode  = PREVIEWABLE.includes(language)
  const lineCount  = children.split('\n').length
  const longCode   = lineCount > 25

  const copy = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <>
      {fullscreen && <FullscreenPreview code={children} onClose={() => setFullscreen(false)} />}

      <div className="my-4 rounded-lg overflow-hidden border border-zinc-700/60 shadow-lg"
           style={{ background: '#1e1e2e' }}>

        {/* ── 顶部标题栏 ── */}
        <div className="flex items-center justify-between px-3 py-2"
             style={{ background: '#252537', borderBottom: '1px solid #2e2e45' }}>

          {/* 左侧：语言标识 + 预览切换 */}
          <div className="flex items-center gap-2 min-w-0">
            {/* 语言色点 + 图标 + 名称 */}
            <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-mono shrink-0">
              <span style={{ color: meta?.color ?? '#9ca3af' }}>
                {meta?.icon ?? <FileCode2 className="size-3.5" />}
              </span>
              <span style={{ color: meta?.color ?? '#9ca3af' }}>
                {language}
              </span>
              <span className="text-zinc-600 ml-1 hidden sm:inline">
                {lineCount} 行
              </span>
            </div>

            {/* 视图切换（仅可预览语言） */}
            {isWebCode && (
              <div className="flex items-center bg-[#1e1e2e] rounded border border-zinc-700 overflow-hidden ml-2">
                <button
                  onClick={() => setViewMode('code')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${
                    viewMode === 'code'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <Code className="size-3" /> 源码
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <Play className="size-3" /> 预览
                </button>
              </div>
            )}
          </div>

          {/* 右侧：工具按钮组 */}
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {/* 折行 */}
            {viewMode === 'code' && (
              <button
                onClick={() => setWordWrap(v => !v)}
                title={wordWrap ? '关闭折行' : '开启折行'}
                className={`p-1.5 rounded text-xs transition-colors ${
                  wordWrap ? 'text-indigo-400 bg-indigo-900/30' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                <WrapText className="size-3.5" />
              </button>
            )}

            {/* 折叠（长代码） */}
            {longCode && viewMode === 'code' && (
              <button
                onClick={() => setCollapsed(v => !v)}
                title={collapsed ? '展开代码' : '折叠代码'}
                className="p-1.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                {collapsed
                  ? <ChevronRight className="size-3.5" />
                  : <ChevronDown className="size-3.5" />
                }
              </button>
            )}

            {/* 全屏预览 */}
            {isWebCode && viewMode === 'preview' && (
              <button
                onClick={() => setFullscreen(true)}
                title="全屏预览"
                className="p-1.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}

            {/* 下载 */}
            <button
              onClick={() => downloadCode(children, language)}
              title="下载文件"
              className="p-1.5 rounded text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <Download className="size-3.5" />
            </button>

            {/* 复制 */}
            <button
              onClick={copy}
              title="复制代码"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                copied
                  ? 'text-green-400 bg-green-900/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>

        {/* ── 代码 / 预览区域 ── */}
        {viewMode === 'preview' && isWebCode ? (
          /* 预览 iframe，支持拖拽调整高度 */
          <div
            className="bg-white"
            style={{ height: '420px', resize: 'vertical', overflow: 'hidden', minHeight: '200px', maxHeight: '90vh' }}
          >
            <iframe
              srcDoc={children}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-modals allow-forms allow-popups"
              title="Preview"
            />
          </div>
        ) : (
          /* 代码高亮区 */
          <div
            className="relative overflow-hidden transition-all duration-300"
            style={{ maxHeight: collapsed ? '5.5rem' : 'none' }}
          >
            <SyntaxHighlighter
              language={normLang(language)}
              style={vscDarkPlus}
              showLineNumbers
              lineNumberStyle={lineNumberStyle}
              wrapLongLines={wordWrap}
              customStyle={{
                margin: 0,
                padding: '1rem 1rem 1rem 0',
                background: 'transparent',
                fontSize: '0.8125rem',
                lineHeight: '1.6',
              }}
              PreTag="div"
            >
              {children}
            </SyntaxHighlighter>

            {/* 折叠后渐变遮罩 */}
            {collapsed && (
              <div
                className="absolute inset-x-0 bottom-0 h-12 flex items-end justify-center pb-2 cursor-pointer"
                style={{ background: 'linear-gradient(transparent, #1e1e2e)' }}
                onClick={() => setCollapsed(false)}
              >
                <span className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                  <ChevronDown className="size-3" /> 展开 {lineCount} 行代码
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
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
    table.querySelectorAll('tr').forEach(row => {
      const cells = row.querySelectorAll('th, td')
      text += Array.from(cells).map(c => c.textContent?.trim() ?? '').join('\t') + '\n'
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

  useEffect(() => { if (isActive) setExpanded(true) }, [isActive])
  useEffect(() => {
    if (isActive && contentRef.current)
      contentRef.current.scrollTop = contentRef.current.scrollHeight
  }, [content, isActive])

  return (
    <div className={`thinking-block ${isActive ? 'thinking-active' : ''}`}>
      <button onClick={() => setExpanded(!expanded)} className="thinking-header">
        <div className="thinking-icon-wrapper">
          <Brain className={`size-4 ${isActive ? 'animate-pulse' : ''}`} />
        </div>
        <span className="thinking-label">{isActive ? '正在思考...' : '思考过程'}</span>
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

function preprocessLaTeX(content: string) {
  let processed = content
  // replace \[ ... \] with $$ ... $$
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
  // replace \( ... \) with $ ... $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
  return processed
}

export const MessageRenderer = React.memo(function MessageRenderer({ content, role, isStreaming, isThinking }: MessageRendererProps) {
  const [msgCopied, setMsgCopied] = useState(false)

  const copyMessage = () => {
    const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    navigator.clipboard.writeText(clean)
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 2000)
  }

  if (role === 'user') {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
  }

  const thinkRegex = /<think>([\s\S]*?)<\/think>/g
  const thinkBlocks: string[] = []
  let cleanContent = content.replace(thinkRegex, (_, t) => {
    thinkBlocks.push(t.trim())
    return ''
  }).trim()

  const unclosedMatch = cleanContent.match(/<think>([\s\S]*)$/)
  let activeThinkContent = ''
  if (unclosedMatch) {
    activeThinkContent = unclosedMatch[1].trim()
    cleanContent = cleanContent.replace(/<think>[\s\S]*$/, '').trim()
  }

  // Before rendering, normalize LaTeX formatting for AI models
  cleanContent = preprocessLaTeX(cleanContent)

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
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex as any]}
            components={{
              pre: ({ children }) => <>{children}</>,
              code: ({ className, children }) => {
                // className can be 'language-xxx' or 'language-xxx hljs' from rehype
                const isBlock = className?.includes('language-')
                if (isBlock) {
                  // Normalize: extract just 'language-xxx' part
                  const langClass = className?.split(' ').find(c => c.startsWith('language-'))
                  return (
                    <CodeBlock className={langClass}>
                      {String(children).replace(/\n$/, '')}
                    </CodeBlock>
                  )
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
})
