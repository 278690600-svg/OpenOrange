"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  ChevronDown, ChevronRight, Brain, Copy, Check, FileCode2,
  Code, Download, Maximize2, Minimize2, WrapText,
  Terminal, Globe, Braces, FileJson, Hash, FileDown, Presentation, PanelRight,
  Folder, File, CodeXml
} from 'lucide-react'
import type { Citation } from '@/hooks/use-sse-chat'
import { asBlob } from 'html-docx-js-typescript'
import { saveAs } from 'file-saver'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
const MermaidRenderer = React.lazy(() => import('./mermaid-renderer').then(m => ({ default: m.MermaidRenderer })))
import { PptRenderer } from './ppt-renderer'
import { ExcelPreview } from './excel-preview'
import { useArtifact } from '@/lib/artifact-context'
import { useI18n } from '@/lib/i18n'

interface MessageRendererProps {
  id?: string
  content: string
  role: 'user' | 'assistant'
  isStreaming?: boolean
  isThinking?: boolean
  citations?: Citation[]
  onOptionClick?: (value: string) => void
  onDelete?: () => void
  onQuote?: () => void
}

class MessageErrorBoundaryInner extends React.Component<
  { children: React.ReactNode; errorMessage: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; errorMessage: string }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.warn('[MessageRenderer] Render error caught:', error.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm">
          {this.props.errorMessage}
        </div>
      )
    }
    return this.props.children
  }
}

function MessageErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return <MessageErrorBoundaryInner errorMessage={t("Message render error, please refresh.")}>{children}</MessageErrorBoundaryInner>
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
  mermaid:    { icon: <Code className="size-3.5" />,      color: '#00C853', ext: 'mmd'  },
  ppt:        { icon: <Presentation className="size-3.5" />, color: '#EA580C', ext: 'json' },
  task:       { icon: <Check className="size-3.5" />,     color: '#10B981', ext: 'txt'  },
  csv:        { icon: <FileCode2 className="size-3.5" />, color: '#10B981', ext: 'csv'  },
  markdown:   { icon: <FileCode2 className="size-3.5" />, color: '#000000', ext: 'md'   },
  md:         { icon: <FileCode2 className="size-3.5" />, color: '#000000', ext: 'md'   },
  xlsx:       { icon: <FileDown className="size-3.5" />,  color: '#1D6F42', ext: 'xlsx' },
  xls:        { icon: <FileDown className="size-3.5" />,  color: '#1D6F42', ext: 'xlsx' },
  docx:       { icon: <FileDown className="size-3.5" />,  color: '#2B579A', ext: 'docx' },
  doc:        { icon: <FileDown className="size-3.5" />,  color: '#2B579A', ext: 'docx' },
  javascriptreact: { icon: <Braces className="size-3.5" />, color: '#61DAFB', ext: 'jsx' },
  typescriptreact: { icon: <Braces className="size-3.5" />, color: '#61DAFB', ext: 'tsx' },
  react:      { icon: <Braces className="size-3.5" />, color: '#61DAFB', ext: 'jsx' },
  plaintext:  { icon: <WrapText className="size-3.5" />, color: '#71717a', ext: 'txt' },
}
const PREVIEWABLE = ['html', 'svg', 'mermaid', 'ppt', 'task', 'docx', 'xlsx']

// 标准化语言名到 Prism
function normLang(lang: string) {
  const map: Record<string, string> = {
    react: 'jsx', tsx: 'tsx', ts: 'typescript', js: 'javascript',
    py: 'python', sh: 'bash', shell: 'bash',
    plaintext: 'text', text: 'text', txt: 'text'
  }
  return map[lang] ?? lang
}

// 触发统一下载逻辑
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 1. Markdown 转换为精美富文本 HTML (Word 导出专用)
function compileMarkdownToWordHtml(markdown: string): string {
  // 1. 处理代码块 (``` [lang] ... ```)
  const codeBlocks: string[] = []
  let html = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `<!-- CODE_BLOCK_${codeBlocks.length} -->`
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    
    const preStyle = `
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 14px 0;
      font-family: Consolas, Monaco, 'Courier New', Courier, monospace;
      font-size: 9.5pt;
      line-height: 1.5;
      color: #334155;
      word-break: break-all;
      white-space: pre-wrap;
    `.replace(/\s+/g, ' ').trim()
    
    const blockHtml = `<pre style="${preStyle}">${escapedCode}</pre>`
    codeBlocks.push(blockHtml)
    return placeholder
  })

  // 2. 处理标题 (h1 - h6)
  html = html
    .replace(/^# (.*$)/gim, '<h1 style="font-size: 22pt; font-family: \'PingFang SC\', \'Microsoft YaHei\', sans-serif; color: #1E3A8A; font-weight: bold; margin-top: 24pt; margin-bottom: 12pt; text-align: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 6px;">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size: 16pt; font-family: \'PingFang SC\', \'Microsoft YaHei\', sans-serif; color: #2B6CB0; font-weight: bold; margin-top: 18pt; margin-bottom: 8pt; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px;">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 style="font-size: 13pt; font-family: \'PingFang SC\', \'Microsoft YaHei\', sans-serif; color: #4A5568; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt;">$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4 style="font-size: 11.5pt; font-family: \'PingFang SC\', \'Microsoft YaHei\', sans-serif; color: #2D3748; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt;">$1</h4>')

  // 3. 处理分割线 (---)
  html = html.replace(/^\s*[-*_]{3,}\s*$/gim, '<hr style="border: none; border-top: 1px dashed #CBD5E1; margin: 20px 0;" />')

  // 4. 处理块引用 (blockquote)
  const lines = html.split('\n')
  let inBlockquote = false
  let quoteLines: string[] = []
  const outputAfterQuote: string[] = []

  const quoteStyle = `
    background-color: #F8FAFC;
    border-left: 4px solid #3B82F6;
    padding: 10px 16px;
    margin: 12px 0;
    color: #475569;
    font-style: italic;
    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 10.5pt;
  `.replace(/\s+/g, ' ').trim()

  for (let line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('>')) {
      inBlockquote = true
      const content = trimmed.substring(1).replace(/^\s+/, '')
      quoteLines.push(content)
    } else {
      if (inBlockquote && quoteLines.length > 0) {
        outputAfterQuote.push(`<div style="${quoteStyle}">${quoteLines.join('<br />')}</div>`)
        quoteLines = []
        inBlockquote = false
      }
      outputAfterQuote.push(line)
    }
  }
  if (inBlockquote && quoteLines.length > 0) {
    outputAfterQuote.push(`<div style="${quoteStyle}">${quoteLines.join('<br />')}</div>`)
  }
  html = outputAfterQuote.join('\n')

  // 5. 处理无序列表
  const linesUl = html.split('\n')
  let inUl = false
  const outputAfterUl: string[] = []
  
  const liStyle = `
    font-family: 'PingFang SC', sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    margin-bottom: 4px;
    color: #374151;
  `.replace(/\s+/g, ' ').trim()

  for (let line of linesUl) {
    const trimmed = line.trim()
    const match = line.match(/^\s*[-*+]\s+(.*)$/)
    if (match) {
      if (!inUl) {
        outputAfterUl.push('<ul style="margin-bottom: 12pt; padding-left: 20px;">')
        inUl = true
      }
      outputAfterUl.push(`<li style="${liStyle}">${match[1]}</li>`)
    } else {
      if (inUl) {
        outputAfterUl.push('</ul>')
        inUl = false
      }
      outputAfterUl.push(line)
    }
  }
  if (inUl) {
    outputAfterUl.push('</ul>')
  }
  html = outputAfterUl.join('\n')

  // 6. 处理有序列表
  const linesOl = html.split('\n')
  let inOl = false
  const outputAfterOl: string[] = []

  for (let line of linesOl) {
    const trimmed = line.trim()
    const match = line.match(/^\s*\d+\.\s+(.*)$/)
    if (match) {
      if (!inOl) {
        outputAfterOl.push('<ol style="margin-bottom: 12pt; padding-left: 20px;">')
        inOl = true
      }
      outputAfterOl.push(`<li style="${liStyle}">${match[1]}</li>`)
    } else {
      if (inOl) {
        outputAfterOl.push('</ol>')
        inOl = false
      }
      outputAfterOl.push(line)
    }
  }
  if (inOl) {
    outputAfterOl.push('</ol>')
  }
  html = outputAfterOl.join('\n')

  // 7. 处理表格
  const linesTable = html.split('\n')
  let inTable = false
  let tableRows: string[] = []
  const outputAfterTable: string[] = []

  for (let line of linesTable) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      if (trimmed.includes('---')) continue
      
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())
      const isHeader = tableRows.length === 0
      
      const rowStyle = isHeader ? 'background-color: #F1F5F9; font-weight: bold; color: #1E293B;' : 'background-color: #FFFFFF;'
      const cellTag = isHeader ? 'th' : 'td'
      const cellStyle = 'border: 1px solid #CBD5E1; padding: 10px 14px; font-family: sans-serif; font-size: 10.5pt; text-align: left;'
      
      const processedCells = cells.map(c => c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'))
      
      const rowHtml = `<tr style="${rowStyle}">` + processedCells.map(c => `<${cellTag} style="${cellStyle}">${c}</${cellTag}>`).join('') + '</tr>'
      tableRows.push(rowHtml)
    } else {
      if (inTable && tableRows.length > 0) {
        outputAfterTable.push(`<table style="border-collapse: collapse; width: 100%; border: 1px solid #CBD5E1; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">${tableRows.join('')}</table>`)
        tableRows = []
        inTable = false
      }
      outputAfterTable.push(line)
    }
  }
  if (inTable && tableRows.length > 0) {
    outputAfterTable.push(`<table style="border-collapse: collapse; width: 100%; border: 1px solid #CBD5E1; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">${tableRows.join('')}</table>`)
  }
  html = outputAfterTable.join('\n')

  // 8. 处理加粗、倾斜、删除线、行内代码
  html = html
    .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold; color: #111827;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>')
    .replace(/~~(.*?)~~/g, '<del style="text-decoration: line-through; color: #9CA3AF;">$1</del>')
    .replace(/`([^`]+)`/g, '<code style="background-color: #F1F5F9; color: #EB5757; padding: 2px 4px; border-radius: 4px; font-family: Consolas, monospace; font-size: 9pt;">$1</code>')

  // 9. 对没有被 html 标记包裹的普通行包裹成 <p>
  html = html.split('\n').map(l => {
    const t = l.trim()
    if (!t) return ''
    if (
      t.startsWith('<!-- CODE_BLOCK_') ||
      t.startsWith('<h') || 
      t.startsWith('<ul') || 
      t.startsWith('<ol') || 
      t.startsWith('<li') || 
      t.startsWith('<table') || 
      t.startsWith('<tr') || 
      t.startsWith('<td') || 
      t.startsWith('<blockquote') || 
      t.startsWith('<div') || 
      t.startsWith('<pre') ||
      t.startsWith('<hr')
    ) {
      return l
    }
    return `<p style="font-family: 'PingFang SC', sans-serif; font-size: 11pt; line-height: 1.6; color: #374151; margin-bottom: 10pt;">${l}</p>`
  }).join('\n')

  // 10. 恢复代码块
  codeBlocks.forEach((blockHtml, i) => {
    html = html.replace(`<!-- CODE_BLOCK_${i} -->`, blockHtml)
  })

  return `
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; color: #333333;">
        ${html}
      </body>
    </html>
  `
}

// 2. 将 Excel 代码块转换为二进制 ArrayBuffer
async function convertToExcelBuffer(code: string): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx')
  const cleanCode = code.trim()
  
  // A. 尝试 JSON 解析
  try {
    const json = JSON.parse(cleanCode)
    const wb = XLSX.utils.book_new()
    
    // 情况 1: { sheets: [ { name: 'Sheet1', headers: [...], rows: [[...]] } ] }
    if (json && json.sheets && Array.isArray(json.sheets)) {
      json.sheets.forEach((sheet: any) => {
        const name = sheet.name || 'Sheet'
        const headers = sheet.headers || []
        const rows = sheet.rows || []
        const data = [headers, ...rows]
        const ws = XLSX.utils.aoa_to_sheet(data)
        XLSX.utils.book_append_sheet(wb, ws, name)
      })
    } 
    // 情况 2: 扁平的 JSON 数组 [ { 姓名: '张三', 年龄: 18 } ]
    else if (Array.isArray(json)) {
      const ws = XLSX.utils.json_to_sheet(json)
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    }
    // 情况 3: 单个普通 JSON 对象
    else if (typeof json === 'object') {
      const ws = XLSX.utils.json_to_sheet([json])
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    }
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return wbout
  } catch (_e) {
    // B. JSON 无法解析，则降级为 CSV / Tab 模式解析
    const lines = cleanCode.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    
    // 检测分隔符
    const firstLine = lines[0] || ''
    const delimiter = firstLine.includes('\t') ? '\t' : ','
    
    const data = lines.map(line => {
      // 简单处理带双引号的情况
      return line.split(delimiter).map(cell => {
        return cell.replace(/^"(.*)"$/, '$1').trim()
      })
    })
    
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return wbout
  }
}

// 下载文件 (增强版，支持 Excel/Word/PPT)
async function downloadCode(code: string, lang: string, customFilename?: string) {
  const meta = LANG_META[lang]
  const ext  = meta?.ext ?? 'txt'
  const filename = customFilename || `file_${Date.now()}.${ext}`

  // 1. 处理 Excel
  if (ext === 'xlsx' || ext === 'xls') {
    const wbout = await convertToExcelBuffer(code)
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, filename)
    return
  }

  // 2. 处理 Word
  if (ext === 'docx' || ext === 'doc') {
    // 采用增强的 HTML 样式导出
    const htmlContent = compileMarkdownToWordHtml(code)
    const blob = await asBlob(htmlContent)
    saveAs(blob as Blob, filename)
    return
  }

  // 3. 处理 PPT (如果代码是 PPT JSON 格式)
  if (lang === 'ppt') {
    try {
      const PptxGenJS = (await import('pptxgenjs')).default
      const pres = new PptxGenJS()
      const data = JSON.parse(code)
      const slides = Array.isArray(data) ? data : (data.slides || [])
      
      slides.forEach((s: { title?: string; content?: string; items?: string[] }) => {
        const slide = pres.addSlide()
        if (s.title) slide.addText(s.title, { x: 0.5, y: 0.5, w: '90%', fontSize: 24, bold: true })
        if (s.content) slide.addText(s.content, { x: 0.5, y: 1.5, w: '90%', fontSize: 18 })
        if (s.items) {
          slide.addText(s.items.join('\n'), { x: 0.5, y: 2.5, w: '90%', fontSize: 14, bullet: true })
        }
      })
      pres.writeFile({ fileName: filename })
      return
    } catch (e) {
      console.error("PPT Generation failed", e)
      // 降级到文本下载
    }
  }

  // 4. 标准代码/文本下载
  let mime = 'text/plain;charset=utf-8'
  if (['csv', 'html', 'json', 'svg', 'js', 'ts', 'jsx', 'tsx'].includes(ext)) {
    if (ext === 'csv') mime = 'text/csv;charset=utf-8'
    else if (ext === 'html') mime = 'text/html;charset=utf-8'
    else if (ext === 'json') mime = 'application/json;charset=utf-8'
    else if (ext === 'svg') mime = 'image/svg+xml;charset=utf-8'
    else if (ext === 'js' || ext === 'ts') mime = 'application/javascript;charset=utf-8'
    else if (ext === 'jsx' || ext === 'tsx') mime = 'application/javascript;charset=utf-8'
  }
  
  const blob = new Blob([code], { type: mime })
  triggerDownload(blob, filename)
}

function TaskChecklist({ data }: { data: string }) {
  const { t } = useI18n()
  const lines = data.split('\n').filter(l => l.trim())
  
  return (
    <div className="my-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm border-l-4 border-l-emerald-500">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 rounded-md">
            <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight">{t("Task Breakdown")}</span>
        </div>
        <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-mono font-bold">TASK LIST</span>
      </div>
      <div className="space-y-3">
        {lines.map((line, i) => {
          const checked = line.trim().startsWith('[x]')
          const text = line.replace(/^\[[ x]\]/, '').trim()
          return (
            <div key={i} className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${checked ? 'opacity-60 bg-zinc-100/50 dark:bg-zinc-800/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}>
              <div className={`mt-0.5 size-5 rounded-md border flex items-center justify-center transition-all ${
                checked ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:border-emerald-500'
              }`}>
                {checked ? <Check className="size-3.5" strokeWidth={3} /> : <div className="size-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full group-hover:bg-emerald-500 transition-colors" />}
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className={`text-[13px] leading-relaxed font-medium ${checked ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-200'}`}>
                  {text}
                </span>
                {!checked && <div className="h-1 w-0 group-hover:w-full bg-emerald-500/20 transition-all duration-500 rounded-full" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectCard({ title, filesCount, onClick }: { title: string, filesCount: number, onClick: () => void }) {
  const { t } = useI18n()
  const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  
  return (
    <div 
      onClick={onClick}
      className="group my-4 p-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-xl hover:border-indigo-500/50 transition-all duration-500 cursor-pointer flex items-center justify-between overflow-hidden relative"
    >
      {/* Background Glow */}
      <div className="absolute -right-4 -top-4 size-32 bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-all" />
      
      <div className="flex items-center gap-4 relative z-10">
        <div className="size-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
          <CodeXml className="size-7" />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {title || t("New Project Prototype")}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-bold uppercase">V2</span>
          </div>
          <div className="text-[11px] text-zinc-400 font-medium">
            {t("Created")}: {currentTime} · {filesCount} {t("files")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 relative z-10">
        <button 
          className="size-10 rounded-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:bg-indigo-600 group-hover:border-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm"
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function SelectionOptions({ options, onSelect }: { options: Array<{ label: string; value: string }>; onSelect: (val: string) => void }) {
  const { t } = useI18n()
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-6 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-full text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-2 px-1">{t("Select next action:")}</div>
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onSelect(opt.value)}
          className="px-4 py-2 text-sm rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 shadow-sm flex items-center gap-2 group transform active:scale-95"
        >
          <span className="font-medium">{opt.label}</span>
          <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </button>
      ))}
    </div>
  )
}

// 全屏浮层
function FullscreenPreview({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useI18n()
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
          <span className="font-mono">{t("Live Preview")}</span>
          <span className="text-zinc-500 ml-2">{t("Press ESC to exit fullscreen")}</span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-700"
        >
          <Minimize2 className="size-3.5" /> {t("Exit Fullscreen")}
        </button>
      </div>
      <iframe
        srcDoc={code}
        className="flex-1 w-full border-0 bg-card"
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
  color: '#94a3b8',
  userSelect: 'none',
  textAlign: 'right',
  borderRight: '1px solid #f1f5f9',
  marginRight: '1em',
}

function checkIsAsciiArt(content: string): boolean {
  if (!content) return false
  
  // 1. 如果包含典型的制图字符
  const drawingChars = /[┌┐└┘├┤┬┴┼═║╔╗╚╝╬─╭╮╯╰╱╲╳]/g
  const drawingMatches = content.match(drawingChars)
  if (drawingMatches && drawingMatches.length > 3) return true

  // 2. 如果包含大量的 ASCII 表格结构 (如 |---+---| 或 +---+ )
  const tablePatterns = /[+|].*[+|].*\n/g
  const tableMatches = content.match(tablePatterns)
  if (tableMatches && tableMatches.length > 3) return true

  // 3. 如果包含大面积的框架线 (如 10 个以上的 === 或 ---)
  const framePatterns = /(={6,})|(-{6,})|(_{6,})/g
  if (framePatterns.test(content)) return true

  // 4. 如果存在典型的斜线/反斜线画 (连续多行包含大量 / \ |)
  const artChars = /[|\\\/]{3,}/g
  const artMatches = content.match(artChars)
  if (artMatches && artMatches.length > 3) return true

  return false
}

// 辅助函数：从 React Children 中递归提取纯文本
function extractTextFromChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map(child => {
      if (typeof child === 'string' || typeof child === 'number') return child
      if (React.isValidElement(child) && child.props && typeof child.props === 'object' && child.props !== null && 'children' in child.props) {
        return extractTextFromChildren((child.props as { children?: React.ReactNode }).children)
      }
      return ''
    })
    .join('')
}

// 专门用于 ASCII 艺术、仪表盘等预格式化内容的容器
function MonoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono-box-container my-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20 overflow-x-auto no-scrollbar select-all">
      <div 
        className="p-4 whitespace-pre text-foreground min-w-max tracking-normal"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '11px',
          lineHeight: '1.15',
          letterSpacing: '0px',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// 极简文件树渲染组件
function FileTree({ data }: { data: string }) {
  const { t } = useI18n()
  // 预处理：如果数据包含大量的 | 或 ├─ 分隔符且没有换行，尝试将其转为多行
  let processData = data
  if (!data.includes('\n')) {
    if (data.includes('|')) processData = data.split('|').join('\n')
    else if (data.includes('├─')) processData = data.split('├─').join('\n├─')
  }

  const lines = processData.split('\n').filter(l => l.trim())
  
  return (
    <div className="file-tree-container my-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 overflow-hidden shadow-sm">
      <div className="px-4 py-2 bg-zinc-100/80 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          <Folder className="size-3.5 text-amber-500" />
          <span>{t("Project Files")}</span>
        </div>
      </div>
      <div className="p-4 font-mono text-[13px] leading-6 overflow-x-auto whitespace-pre no-scrollbar">
        {lines.map((line, idx) => {
          const isDir = line.includes('/') || line.trim().endsWith('/')
          const cleanLine = line.trim()
          
          return (
            <div key={idx} className="flex items-center gap-2 group/line transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
              <span 
                className="select-none inline-block min-w-fit whitespace-pre text-zinc-300 dark:text-zinc-700"
              >
                {cleanLine.replace(/[^├└─\s|].*$/, '').split(/([├└]──\s*)/).map((part, i) => 
                  /^[├└]──\s*$/.test(part) ? <span key={i} className="text-zinc-300 dark:text-zinc-700">{part}</span> : part
                )}
              </span>
              {isDir ? (
                <Folder className="size-3.5 text-amber-500/80 shrink-0" />
              ) : (
                <File className="size-3.5 text-zinc-400 shrink-0" />
              )}
              <span className="truncate">{line.replace(/^.*[├└]──\s*|^.*[|├└]─\s*|^.*\s*├─\s*/, '').trim()}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CodeBlock({ children, className, isStreaming, getProjectFiles }: { children: string; className?: string; isStreaming?: boolean; getProjectFiles?: () => Array<{ language: string; name: string; content: string }> }) {
  const { t } = useI18n()
  const language = className?.split(' ').find(c => c.startsWith('language-'))?.replace('language-', '') ?? 'text'
  const meta       = LANG_META[language]
  const isWebCode  = PREVIEWABLE.includes(language)
  const lines      = children.split('\n')
  const lineCount  = lines.length
  const longCode   = lineCount > 20 || children.length > 800

  const isAsciiArt = React.useMemo(() => {
    return checkIsAsciiArt(children)
  }, [children])

  // 尝试匹配文件名
  const myFile = React.useMemo(() => {
    const allFiles = getProjectFiles?.() || []
    return allFiles.find(f => f.content.trim() === children.trim())
  }, [children, getProjectFiles])
  const filename = myFile?.name || ''

  const [copied,      setCopied]      = useState(false)
  const [viewMode,    setViewMode]    = useState<'code' | 'preview'>('code')
  const [collapsed,   setCollapsed]   = useState(false) 
  const [wordWrap,    setWordWrap]    = useState(false)
  const [fullscreen,  setFullscreen]  = useState(false)
  
  const { setActiveArtifact } = useArtifact()
  const codeRef = useRef<HTMLDivElement>(null)

  // 内部自动置底滚动
  useEffect(() => {
    if (isStreaming && codeRef.current) {
        codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [children, isStreaming])

  // Ensure 'Source' first logic: reset to code mode when streaming begins
  useEffect(() => {
    if (isStreaming) {
      requestAnimationFrame(() => setViewMode('code'))
    }
  }, [isStreaming])

  // Track streaming transition
  const prevStreaming = useRef(isStreaming)
  useEffect(() => {
    // When generation finishes
    if (prevStreaming.current && !isStreaming) {
      if (isWebCode) {
        requestAnimationFrame(() => {
          setViewMode('preview')
          setCollapsed(false)
        })
        setActiveArtifact({ 
          id: `final-${language}-${Date.now()}`, 
          language, 
          code: children,
          files: getProjectFiles?.() 
        })
      } else if (longCode) {
        requestAnimationFrame(() => setCollapsed(true))
      }
    }
    
    prevStreaming.current = isStreaming
  }, [isStreaming, isWebCode, longCode, children, language, setActiveArtifact, getProjectFiles])

  const copy = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  const openInPanel = () => {
    setActiveArtifact({ 
      id: Math.random().toString(), 
      language, 
      code: children,
      files: getProjectFiles?.()
    })
  }

  // 记忆化行号字符串，避免流式输出时每一帧都进行 Array.from + join
  const lineNumbersString = React.useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')
  }, [lineCount])

  return (
    <>
      {fullscreen && <FullscreenPreview code={children} onClose={() => setFullscreen(false)} />}

      <div 
        className="my-6 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card dark:bg-card transition-all"
        style={{ contain: 'layout paint' }}
      >

        {/* ── 顶部标题栏 ── */}
        <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 px-4 py-2.5 sm:py-3 bg-zinc-50/80 dark:bg-card border-b border-zinc-100 dark:border-zinc-800/50 backdrop-blur-sm">

          {/* 左侧：语言标识 + 预览切换 */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-bold shrink-0">
              <div className="size-6 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-center shadow-sm">
                <span style={{ color: meta?.color ?? '#94a3b8' }}>
                  {meta?.icon ?? <FileCode2 className="size-3.5" />}
                </span>
              </div>
              <span className="uppercase tracking-wider">
                {language}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600 mx-1 hidden sm:inline">/</span>
              <span className="font-mono text-[10px] text-zinc-400 hidden sm:inline">
                {lineCount} LINES
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-0.5 sm:px-2 shrink-0">
              {isWebCode && (
                <div className="flex bg-zinc-100 dark:bg-zinc-900/50 p-0.5 sm:p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 shrink-0">
                  <button
                    onClick={() => setViewMode('code')}
                    className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${viewMode === 'code' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                  >
                    <Code className="size-3.5 shrink-0" />
                    <span className="hidden sm:inline">{t("Source Code")}</span>
                    <span className="inline sm:hidden">{t("Code")}</span>
                  </button>
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${viewMode === 'preview' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                  >
                    <Presentation className="size-3.5 shrink-0" />
                    <span>{t("Preview")}</span>
                  </button>
                </div>
              )}
              
              {isStreaming && (
                <span className="flex items-center gap-2 text-[10px] text-indigo-500 font-black ml-2 sm:ml-4 uppercase tracking-widest animate-pulse shrink-0">
                  <div className="size-1.5 rounded-full bg-primary" />
                  GENERATE...
                </span>
              )}
            </div>
          </div>

          {/* 右侧：工具按钮组 */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-2">
            {/* 折行 */}
            {viewMode === 'code' && (
              <button
                onClick={() => setWordWrap(v => !v)}
                title={wordWrap ? t("Disable word wrap") : t("Enable word wrap")}
                className={`p-2 rounded-xl transition-all ${
                  wordWrap ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <WrapText className="size-4" />
              </button>
            )}

            {/* 折叠（长代码） */}
            {longCode && viewMode === 'code' && (
              <button
                onClick={() => setCollapsed(v => !v)}
                title={collapsed ? t("Expand code") : t("Collapse code")}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                {collapsed
                  ? <ChevronRight className="size-4" />
                  : <ChevronDown className="size-4" />
                }
              </button>
            )}

            {/* 全屏预览 */}
            {isWebCode && viewMode === 'preview' && (
              <button
                onClick={() => setFullscreen(true)}
                title={t("Fullscreen preview")}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <Maximize2 className="size-4" />
              </button>
            )}

            {/* 打开 Artifact Canvas */}
            {isWebCode && (
              <button
                onClick={openInPanel}
                title={t("Open in workspace")}
                className="p-2 rounded-xl text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
              >
                <PanelRight className="size-4" />
              </button>
            )}

            <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

            {/* 下载 */}
            <button
              onClick={() => downloadCode(children, language, filename)}
              title={t("Download file")}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            >
              <Download className="size-4" />
            </button>

            {/* 复制 */}
            <button
              onClick={copy}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full text-xs font-bold transition-all shadow-sm shrink-0 whitespace-nowrap ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90'
              }`}
            >
              {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
              <span className="hidden sm:inline">{copied ? 'DONE' : 'COPY'}</span>
            </button>
          </div>
        </div>

        {/* ── 代码 / 预览区域 ── */}
        {viewMode === 'preview' && isWebCode ? (
          <div
            className={language === 'mermaid' ? '' : 'bg-card relative overflow-hidden'}
            style={{ 
              height: language === 'mermaid' ? 'auto' : (isStreaming && language === 'ppt') ? '240px' : '420px', 
              resize: language === 'mermaid' ? 'none' : 'vertical', 
              minHeight: '200px', 
              maxHeight: '90vh',
              transition: 'height 0.3s'
            }}
          >
            {language === 'mermaid' ? (
              <React.Suspense fallback={<div className="p-4 text-zinc-400 text-sm">Loading diagram...</div>}>
                <MermaidRenderer code={children} />
              </React.Suspense>
            ) : language === 'ppt' ? (
              <PptRenderer data={children} isStreaming={isStreaming} />
            ) : language === 'docx' ? (
              children.trim().startsWith('<') ? (
                <div className="h-full overflow-auto bg-white dark:bg-zinc-950 p-6">
                  <div className="max-w-3xl mx-auto prose prose-sm sm:prose" dangerouslySetInnerHTML={{ __html: children }} />
                </div>
              ) : (
                <div className="h-full overflow-auto bg-zinc-100 dark:bg-zinc-900/50 p-6 flex justify-center">
                  <div className="bg-white dark:bg-zinc-950 shadow-lg border border-zinc-200 dark:border-zinc-800 p-10 max-w-3xl w-full min-h-[500px] rounded-sm text-zinc-900 dark:text-zinc-100 prose prose-sm sm:prose dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
                  </div>
                </div>
              )
            ) : language === 'xlsx' ? (
              <div className="h-full overflow-auto p-4">
                <ExcelPreview data={new TextEncoder().encode(children).buffer} />
              </div>
            ) : language === 'task' ? (
              <TaskChecklist data={children} />
            ) : (
              <iframe
                srcDoc={children}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-modals allow-forms allow-popups"
                title="Preview"
              />
            )}
          </div>
        ) : (
          <div
            ref={codeRef}
            className={`relative overflow-hidden transition-all duration-500 ease-in-out group/code ${collapsed ? 'max-h-[400px]' : 'max-h-[5000px]'}`}
            style={{ 
              height: collapsed ? '400px' : 'auto',
              overflowY: (collapsed || isStreaming) ? 'auto' : 'visible' 
            }}
          >
            {isAsciiArt ? (
              <div className="flex bg-zinc-50/30 dark:bg-zinc-950/20 overflow-x-auto no-scrollbar select-all">
                <pre 
                  className="flex-1 m-0 p-5 whitespace-pre text-foreground min-w-max tracking-normal"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '11px',
                    lineHeight: '1.15',
                    letterSpacing: '0px',
                  }}
                >
                  <code>{children}</code>
                </pre>
              </div>
            ) : isStreaming ? (
              <div className="flex bg-transparent">
                {/* 扁平化行号列：将数以百计的 div 简化为一个单字符串渲染以保住性能 */}
                <pre 
                  className="hidden sm:block select-none py-5 px-4 text-right border-r border-zinc-100 dark:border-zinc-800/50 text-[#94a3b8] font-mono text-[11px] leading-[1.7] bg-transparent"
                  style={{ minWidth: '3.8em' }}
                >
                  {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
                </pre>
                <pre className="flex-1 m-0 p-5 pt-5 text-[13px] leading-[1.7] font-mono whitespace-pre bg-transparent scrollbar-none antialiased">
                  <code>{children}</code>
                  {/* 用于自动随流式滚动置底的锚点 */}
                  <div className="h-4" />
                </pre>
              </div>
            ) : (
              <SyntaxHighlighter
                language={normLang(language)}
                style={oneLight}
                showLineNumbers={language !== 'plaintext' && language !== 'text'}
                lineNumberStyle={lineNumberStyle}
                wrapLongLines={wordWrap}
                customStyle={{
                  margin: 0,
                  padding: '1.25rem 1.25rem 1.25rem 0',
                  background: 'transparent',
                  fontSize: '0.8125rem',
                  lineHeight: '1.7',
                }}
                PreTag="div"
              >
                {children}
              </SyntaxHighlighter>
            )}

            {/* 渐变遮罩与展开按钮 */}
            {longCode && (
              <div
                className={`absolute inset-x-0 bottom-0 flex flex-col items-center justify-end transition-all duration-300 pointer-events-none ${
                    collapsed 
                    ? 'h-32 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-[#1e1e2c] dark:via-[#1e1e2c]/80 opacity-100 pb-4' 
                    : 'h-0 opacity-0 overflow-hidden'
                }`}
              >
                <div className="pointer-events-auto">
                    <button 
                        onClick={() => setCollapsed(false)}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200 shadow-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                    >
                        <ChevronDown className="size-3.5" /> 
                        <span>{t("Expand all ({lineCount} lines)", { lineCount })}</span>
                    </button>
                </div>
              </div>
            )}
            
            {/* 已展开时的收起按钮 (仅在非 Flow 模式下显示在底部) */}
            {!collapsed && longCode && !isStreaming && (
                <div className="flex justify-center py-4 border-t border-zinc-50 dark:border-zinc-800/30">
                    <button 
                        onClick={() => setCollapsed(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <ChevronRight className="size-3.5 rotate-90" /> 
                        {t("Collapse overview")}
                    </button>
                </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

const MemoizedCodeBlock = React.memo(CodeBlock, (prev, next) => {
  return (
    prev.children === next.children &&
    prev.isStreaming === next.isStreaming &&
    prev.className === next.className
  )
})

function TableBlock({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
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

  const downloadExcel = async () => {
    if (!tableRef.current) return
    const table = tableRef.current.querySelector('table')
    if (!table) return
    
    // Create workbook and worksheet using SheetJS
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.table_to_book(table, { raw: true })
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    
    // Save as .xlsx file
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `table_${Date.now()}.xlsx`)
  }

  return (
    <div className="table-block-wrapper group relative my-6">
      <div className="table-wrapper app-scrollbar border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm" ref={tableRef}>
        <table className="w-full text-sm text-left border-collapse bg-white dark:bg-zinc-950">
          <style jsx>{`
            table :global(thead) { background-color: #f8f9fa; }
            :global(.dark) table :global(thead) { background-color: #1a1a1a; }
            table :global(th) { 
              padding: 12px 16px; 
              font-weight: 600; 
              color: #4b5563; 
              border-bottom: 2px solid #e5e7eb;
              white-space: nowrap;
            }
            :global(.dark) table :global(th) { 
              color: #9ca3af; 
              border-bottom-color: #374151; 
            }
            table :global(td) { 
              padding: 10px 16px; 
              border-bottom: 1px solid #f3f4f6;
              color: #374151;
            }
            :global(.dark) table :global(td) { 
              border-bottom-color: #1f2937;
              color: #d1d5db;
            }
            table :global(tr:hover) { background-color: #f9fafb; }
            :global(.dark) table :global(tr:hover) { background-color: #111827; }
            table :global(tr:last-child td) { border-bottom: none; }
          `}</style>
          {children}
        </table>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10 translate-y-1 group-hover:translate-y-0">
        <button onClick={downloadExcel} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:border-indigo-900 shadow-lg backdrop-blur-md transition-all text-[10px] font-bold uppercase tracking-wider" title={t("Export to Excel")}>
          <Download className="size-3.5" />
          <span>Excel</span>
        </button>
        <button onClick={copyTable} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:border-indigo-900 shadow-lg backdrop-blur-md transition-all" title={t("Copy table")}>
          {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}

function ThinkingBlock({ content, isActive }: { content: string; isActive?: boolean }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(isActive || false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => { 
    if (isActive) {
      requestAnimationFrame(() => setExpanded(true))
    } else {
      setExpanded(false)
    }
  }, [isActive])
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
        <span className="thinking-label">{isActive ? t("Thinking...") : t("Thinking process")}</span>
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
          {content || (isActive ? t("Thinking") : '')}
        </div>
      )}
    </div>
  )
}

const latexCache = new Map<string, string>()

function preprocessLaTeX(content: string) {
  if (latexCache.has(content)) return latexCache.get(content)!
  
  let processed = content
  // replace \[ ... \] with $$ ... $$
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
  // replace \( ... \) with $ ... $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
  
  if (latexCache.size > 100) latexCache.clear()
  latexCache.set(content, processed)
  return processed
}

export const MessageRenderer = React.memo(function MessageRenderer({ 
  id,
  content, 
  role, 
  isStreaming, 
  isThinking, 
  citations: _citations,
  onOptionClick: _onOptionClick, 
  onDelete: _onDelete,
  onQuote: _onQuote,
}: MessageRendererProps) {
  const [msgCopied, setMsgCopied] = useState(false)
  const [displayText, setDisplayText] = useState(content)
  const lastSyncRef = useRef(0)
  const textBufferRef = useRef(content)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Synchronize with content from context (which updates less frequently now)
  useEffect(() => {
    if (!isStreaming) {
      setDisplayText(content)
      textBufferRef.current = content
    }
  }, [content, isStreaming])

  // Listen for real-time token updates and throttle the React state update
  useEffect(() => {
    if (isStreaming && id) {
      const handler = (e: MessageEvent) => {
        const eventWithDetail = e as unknown as { detail?: { text?: string } }
        if (eventWithDetail.detail && typeof eventWithDetail.detail.text === 'string') {
          const newText = eventWithDetail.detail.text
          textBufferRef.current = newText
          
          const now = Date.now()
          // Throttle state update to ~6-7 fps (150ms) to save CPU during heavy markdown parsing
          if (now - lastSyncRef.current > 150) {
            setDisplayText(newText)
            lastSyncRef.current = now
          } else if (!syncTimerRef.current) {
            // Ensure the final token always gets rendered
            syncTimerRef.current = setTimeout(() => {
              setDisplayText(textBufferRef.current)
              lastSyncRef.current = Date.now()
              syncTimerRef.current = null
            }, 160)
          }
        }
      }
      window.addEventListener(`chat-token-${id}`, handler as EventListener)
      return () => {
        window.removeEventListener(`chat-token-${id}`, handler as EventListener)
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      }
    }
  }, [isStreaming, id])

  const copyMessage = () => {
    const clean = (displayText || content).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '').trim()
    navigator.clipboard.writeText(clean)
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 2000)
  }

  const exportToWord = async () => {
    const safeId = (id || content.substring(0, 10)).replace(/[^a-zA-Z0-9]/g, '-')
    const container = document.getElementById(`msg-container-${safeId}`)
    const html = container?.innerHTML || ''
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Times New Roman', serif; line-height: 1.6; }
            table { border-collapse: collapse; width: 100%; border: 1px solid #ccc; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            pre { background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; }
            code { font-family: Consolas, monospace; }
            h1, h2, h3 { color: #333; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `
    
    const blob = await asBlob(fullHtml)
    saveAs(blob as Blob, `OpenOrangeAI_Export_${Date.now()}.docx`)
  }

  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/g
  const thinkBlocks: string[] = []
  const textToProcess = displayText || content
  let cleanContent = textToProcess.replace(thinkRegex, (_, t) => {
    thinkBlocks.push(t.trim())
    return ''
  }).trim()

  const unclosedMatch = cleanContent.match(/<think(?:ing)?>([ \s\S]*)$/)
  let activeThinkContent = ''
  if (unclosedMatch) {
    activeThinkContent = unclosedMatch[1].trim()
    cleanContent = cleanContent.replace(/<think(?:ing)?>[\s\S]*$/, '').trim()
  }

  cleanContent = preprocessLaTeX(cleanContent)

  const showCursor = isStreaming && !isThinking && cleanContent.length > 0

  const options: Array<{ label: string; value: string }> = []
  const textWithNoOptions = cleanContent.replace(/\[option:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]/g, (match, label, value) => {
    if (!isStreaming) {
      options.push({ label: label.trim(), value: value.trim() })
    }
    return ''
  }).trim()

  const finalContent = textWithNoOptions || cleanContent

  const taskItems: string[] = []
  const finalContentWithTasks = finalContent.replace(/\[task:\s*([^\]]+?)\s*\]/g, (match, item) => {
    taskItems.push(item.trim())
    return ''
  }).trim()

  // Use a stable ref to hold the latest content for callbacks
  const contentRef = React.useRef(finalContentWithTasks)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { contentRef.current = finalContentWithTasks })

  const extractProjectFiles = React.useCallback(() => {
    interface ProjectFile {
      language: string;
      name: string;
      content: string;
    }
    const files: ProjectFile[] = []
    const codeRegex = /```(\w+)(?:\s+\[([\w.-]+)\])?\n([\s\S]*?)```/g
    let match
    const content = contentRef.current
    while ((match = codeRegex.exec(content)) !== null) {
      files.push({
        language: match[1],
        name: match[2] || `file-${files.length + 1}.${LANG_META[match[1]]?.ext || 'txt'}`,
        content: match[3].trim()
      })
    }
    return files
  }, [])

  const isStreamingRef = useRef(isStreaming)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { isStreamingRef.current = isStreaming })

  const markdownComponents = React.useMemo(() => ({
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    code: (props: { className?: string; children?: React.ReactNode }) => {
      const { className, children } = props
      const isBlock = className?.includes('language-')
      if (isBlock) {
        const langClass = className?.split(' ').find((c: string) => c.startsWith('language-'))
        return (
          <MemoizedCodeBlock 
            key={`${langClass}`}
            className={langClass} 
            isStreaming={isStreamingRef.current}
            getProjectFiles={extractProjectFiles}
          >
            {String(children).replace(/\n$/, '')}
          </MemoizedCodeBlock>
        )
      }
      return <code className="inline-code">{children}</code>
    },
    p: ({ children }: { children?: React.ReactNode }) => {
      const text = extractTextFromChildren(children)
      
      if (text.includes('├─') || text.includes('└─') || (text.includes('src/') && (text.includes('─') || text.includes('|')))) {
         return <FileTree data={text} />
      }
      
      if (checkIsAsciiArt(text) && text.includes('\n')) {
        return (
          <MemoizedCodeBlock 
            className="language-plaintext" 
            isStreaming={isStreamingRef.current}
          >
            {text}
          </MemoizedCodeBlock>
        )
      }
      
      return <p className="content-p">{children}</p>
    },
    table: ({ children }: { children?: React.ReactNode }) => <TableBlock>{children}</TableBlock>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="content-link">
        {children}
      </a>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="content-blockquote">{children}</blockquote>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="content-h1">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="content-h2">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="content-h3">{children}</h3>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="content-ul">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="content-ol">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="content-li">{children}</li>,
    hr: () => <hr className="content-hr" />,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="content-strong">{children}</strong>,
  }), [extractProjectFiles])

  const { t } = useI18n()
  const { activeArtifact, setActiveArtifact } = useArtifact()

  useEffect(() => {
    if (!isStreaming && !isThinking) {
      const files = extractProjectFiles()
      if (files.length > 1) {
        if (!activeArtifact || activeArtifact.id !== id) {
          setActiveArtifact({
            id: id || 'project-' + Date.now(),
            language: 'project',
            title: 'Project View',
            code: content,
            files: files
          })
        }
      }
    }
  }, [isStreaming, isThinking, id, extractProjectFiles, activeArtifact, setActiveArtifact, content])

  const openProjectPreview = () => {
    const files = extractProjectFiles()
    setActiveArtifact({
      id: id || 'project-' + Date.now(),
      language: 'project',
      title: 'Project View',
      code: content,
      files: files
    })
  }

  if (role === 'user') {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
  }

  return (
    <MessageErrorBoundary>
    <div className="message-content group/msg relative">
      {thinkBlocks.map((t, i) => (
        <ThinkingBlock key={`done-${i}`} content={t} />
      ))}

      {(activeThinkContent || isThinking) && (
        <ThinkingBlock content={activeThinkContent} isActive={true} />
      )}

      {finalContentWithTasks && (
        <div className="prose-container" id={`msg-container-${(id || (displayText || content).substring(0, 10)).replace(/[^a-zA-Z0-9]/g, '-')}`}>
          <ReactMarkdown
            remarkPlugins={isStreaming ? [remarkGfm] : [remarkGfm, remarkMath]}
            rehypePlugins={isStreaming ? [] : [rehypeKatex as unknown as React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']][0]}
            components={markdownComponents}
          >
            {finalContentWithTasks}
          </ReactMarkdown>
          {showCursor && <span className="streaming-cursor">▍</span>}
        </div>
      )}

      {(() => {
        const projectFiles = !isStreaming && !isThinking ? extractProjectFiles() : []
        return projectFiles.length > 1 ? (
          <ProjectCard 
            title={t("Web Project Prototype")} 
            filesCount={projectFiles.length} 
            onClick={openProjectPreview} 
          />
        ) : null
      })()}

      {/* Render extracted tasks if any */}
      {taskItems.length > 0 && <TaskChecklist data={taskItems.join('\n')} />}

      {/* Interactive selection options */}
      {options.length > 0 && !isStreaming && _onOptionClick && (
        <SelectionOptions options={options} onSelect={_onOptionClick} />
      )}

      {!cleanContent && isStreaming && !isThinking && !activeThinkContent && (
        <span className="streaming-cursor">▍</span>
      )}

    </div>
    </MessageErrorBoundary>
  )
})
