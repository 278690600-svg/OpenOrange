"use client"

import React, { useMemo } from 'react'
import { X, ExternalLink, Code2, Presentation, Globe, Download, Folder, File, ChevronRight, ChevronDown, Monitor, PanelLeft, Eye, Edit3, Loader2 } from 'lucide-react'
import { useArtifact } from '@/lib/artifact-context'
import { useI18n } from '@/lib/i18n'
import { PptRenderer } from '@/components/ppt-renderer'
import { MermaidRenderer } from '@/components/mermaid-renderer'
import { DocxPreview } from '@/components/docx-preview'
import { ExcelPreview } from '@/components/excel-preview'
import { DocumentEditor } from '@/components/document-editor'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { asBlob } from 'html-docx-js-typescript'
import JSZip from 'jszip'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 触发统一下载逻辑 (辅助函数)
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

function createEmptyWorkbook(sheets: Array<{ name: string; headers: string[]; rows: string[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  sheets.forEach(sheet => {
    const data = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  })
  const buf = XLSX.write(wb, { type: 'array' })
  return buf
}

interface FileTreeItem {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeItem[]
  index?: number
}

function buildFileTree(files: { name: string }[]): FileTreeItem[] {
  const root: FileTreeItem[] = []
  
  files.forEach((file, index) => {
    const parts = file.name.split('/')
    let current = root
    
    parts.forEach((part: string, i: number) => {
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      
      let existing = current.find(item => item.name === part)
      
      if (!existing) {
        existing = {
          name: part,
          path,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : [],
          index: isLast ? index : undefined
        }
        current.push(existing)
        // Sort: Folders first, then alphabetically
        current.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      }
      
      if (!isLast) {
        current = existing.children!
      }
    })
  })
  
  return root
}

function FileTreeNode({ 
  item, 
  activeFileIndex, 
  onSelect, 
  level = 0 
}: { 
  item: FileTreeItem
  activeFileIndex: number
  onSelect: (index: number) => void
  level?: number
}) {
  const [isOpen, setIsOpen] = React.useState(true)
  const isSelected = item.type === 'file' && item.index === activeFileIndex

  if (item.type === 'file') {
    return (
      <button
        onClick={() => onSelect(item.index!)}
        className={`w-full flex items-center gap-2 py-1.5 px-2 text-xs transition-colors rounded-md group ${
          isSelected 
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium' 
            : 'text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <File className={`size-3.5 ${isSelected ? 'text-indigo-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
        <span className="truncate">{item.name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 py-1.5 px-2 text-xs text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-md group"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
        <Folder className="size-3.5 text-amber-500/80 fill-amber-500/10" />
        <span className="truncate font-medium">{item.name}</span>
      </button>
      {isOpen && item.children && (
        <div className="mt-0.5">
          {item.children.map((child, i) => (
            <FileTreeNode 
              key={i} 
              item={child} 
              activeFileIndex={activeFileIndex} 
              onSelect={onSelect} 
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ArtifactFile {
  name: string;
  language: string;
  content: string;
}

export function ArtifactPanel() {
  const { activeArtifact, setActiveArtifact } = useArtifact()
  const { t } = useI18n()
  const [activeFileIndex, setActiveFileIndex] = React.useState(0)
  const [viewMode, setViewMode] = React.useState<'preview' | 'code'>('preview')
  const [docMode, setDocMode] = React.useState<'preview' | 'edit'>('preview')
  const [sidebarVisible, setSidebarVisible] = React.useState(true)
  const [docxEditHtml, setDocxEditHtml] = React.useState<string | null>(null)
  const [docxConverting, setDocxConverting] = React.useState(false)

  const isDocxDocument = activeArtifact?.language?.toLowerCase() === 'docx'
  const isExcelDocument = activeArtifact?.language?.toLowerCase() === 'xlsx'
  const isDocumentType = isDocxDocument || isExcelDocument

  // Reset view mode when artifact changes
  React.useEffect(() => {
    if (activeArtifact) {
      const artifactFiles = (activeArtifact.files || []) as ArtifactFile[]
      const isWeb = artifactFiles.some((f) => 
        ['html', 'svg', 'javascript', 'js', 'css', 'typescript', 'ts', 'jsx', 'tsx'].includes(f.language?.toLowerCase())
      ) || ['html', 'svg', 'mermaid', 'ppt', 'docx', 'xlsx'].includes(activeArtifact.language?.toLowerCase())
      
      setViewMode(isWeb ? 'preview' : 'code')
      setActiveFileIndex(0)

      const isDoc = activeArtifact.language?.toLowerCase() === 'docx'
      const isNewDoc = isDoc && activeArtifact.code?.trim().startsWith('<')
      setDocMode(isNewDoc ? 'edit' : 'preview')
      setDocxEditHtml(null)
    }
  }, [activeArtifact?.id, activeArtifact])

  const files: ArtifactFile[] = activeArtifact?.files || []
  const tree = useMemo(() => buildFileTree(files), [activeArtifact?.files])

  const handleDocModeSwitch = React.useCallback(async (mode: 'preview' | 'edit') => {
    if (!isDocxDocument || !activeArtifact) return

    if (mode === 'edit' && !docxEditHtml) {
      const content = activeArtifact.code
      if (content.trim().startsWith('<')) {
        setDocxEditHtml(content)
      } else {
        setDocxConverting(true)
        try {
          const blob = new Blob([content])
          const arrayBuffer = await blob.arrayBuffer()
          const result = await mammoth.convertToHtml({ arrayBuffer })
          setDocxEditHtml(result.value)
        } catch (err) {
          console.error('Failed to convert docx to HTML:', err)
        } finally {
          setDocxConverting(false)
        }
      }
    }
    setDocMode(mode)
  }, [isDocxDocument, activeArtifact, docxEditHtml])

  if (!activeArtifact) return null

  const activeFile = files.length > 0 ? files[activeFileIndex] : { name: 'artifact', language: activeArtifact.language, content: activeArtifact.code }

  // Virtual Sandbox Logic: Combine related files into one HTML for preview
  const getCombinedHtml = () => {
    const hasTailwind = files.some((f) => f.content.includes('@tailwind') || f.content.includes('className='))
    const reactFiles = files.filter((f) => ['jsx', 'tsx'].includes(f.language))
    const hasReact = reactFiles.length > 0
    const hasTS = files.some((f) => ['ts', 'tsx'].includes(f.language))

    // Start with provided HTML or a virtual bootstrapper
    const htmlFile = files.find((f) => f.language === 'html')
    let combined = htmlFile?.content || `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`

    // Inject Head Styles & CDNs (Using Chinese mirrors for reliability)
    const headInjections = []
    // Tailwind CSS
    if (hasTailwind) headInjections.push('<link rel="stylesheet" href="https://cdn.bootcdn.net/ajax/libs/tailwindcss/2.2.19/tailwind.min.css">')
    if (hasReact) {
      headInjections.push('<script src="https://npm.elemecdn.com/react@18/umd/react.production.min.js"></script>')
      headInjections.push('<script src="https://npm.elemecdn.com/react-dom@18/umd/react-dom.production.min.js"></script>')
      headInjections.push('<script src="https://npm.elemecdn.com/@babel/standalone/babel.min.js"></script>')
    }
    headInjections.push('<script src="https://npm.elemecdn.com/lucide@latest"></script>')
    
    // Custom CSS
    const cssContent = files.filter((f) => f.language === 'css').map((f) => f.content).join('\n')
    if (cssContent) headInjections.push(`<style>${cssContent}</style>`)

    if (combined.includes('</head>')) {
      combined = combined.replace('</head>', headInjections.join('\n') + '\n</head>')
    } else {
      combined = headInjections.join('\n') + combined
    }

    // Sanitize AI-generated HTML (remove localhost/vite references that cause CORS errors)
    combined = combined.replace(/http:\/\/127\.0\.0\.1:3000\//g, '')
    combined = combined.replace(/http:\/\/localhost:3000\//g, '')
    // Remove any hardcoded <script src="/src/main.jsx"> or similar that AI often generates
    combined = combined.replace(/<script\s+[^>]*src=['"]\/src\/main\.jsx['"][^>]*><\/script>/g, '')
    combined = combined.replace(/<script\s+[^>]*src=['"][^'"]*vite[^'"]*['"][^>]*><\/script>/g, '')
    // Remove type="module" from scripts as we use Babel standalone
    combined = combined.replace(/type\s*=\s*['"]module['"]/g, 'type="text/babel"')

    // Inject JS / JSX / TSX
    const jsFiles = files.filter((f) => 
      ['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(f.language)
    )
    
    let scriptContent = jsFiles.map((f) => {
       // 预处理：移除 import 和 export 关键字，因为在 UMD/Babel 脚本环境下这些通常由全局变量提供
       let content = f.content
       // 预处理：移除所有的 import 语句 (支持多行和空格)
       content = content.replace(/^\s*import\s+[\s\S]*?from\s+['"].*?['"];?/gm, '')
       // 移除所有的 export 关键字，但保留内容
       content = content.replace(/^\s*export\s+default\s+/gm, '')
       content = content.replace(/^\s*export\s+(const|var|let|function|class)\s+/gm, '$1 ')
       // 移除独立的 export { ... }
       content = content.replace(/^\s*export\s+\{[\s\S]*?\};?/gm, '')
       
       return `// File: ${f.name}\n${content}`
    }).join('\n\n')

    const scriptType = (hasReact || hasTS) ? 'text/babel' : 'text/javascript'
    
    // 将挂载脚本直接追加入 scriptContent，并确保类型为 text/babel，这样它会由 Babel 处理并在转换后运行
    if (hasReact && !combined.includes('ReactDOM.createRoot')) {
      scriptContent += `\n\n
// Auto-generated React Bootstrapper
(function() {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  // 尝试寻找入口组件 (在 Babel 转换后的局部作用域中，或者 window 上)
  let EntryPoint = null;
  try { EntryPoint = App; } catch(e) {}
  
  if (!EntryPoint) {
    // 启发式搜索：寻找最后一个定义的以大写字母开头的全局/局部变量
    const code = document.getElementById('project-scripts').textContent;
    const re = /(?:function|const|class)\\s+([A-Z][\\w$]*)/g;
    let match;
    const possibleNames = [];
    while(match = re.exec(code)) {
      possibleNames.push(match[1]);
    }
    if (possibleNames.length > 0) {
      const lastFound = possibleNames[possibleNames.length - 1];
      // Validate: must be a valid React component name (uppercase start, alphanumeric only)
      if (/^[A-Z][a-zA-Z0-9_$]*$/.test(lastFound)) {
        try { EntryPoint = window[lastFound]; } catch(e) {}
      }
    }
  }

  if (EntryPoint) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(EntryPoint));
    console.log("Mounted entry point:", EntryPoint.name || "App");
  } else {
    rootElement.innerHTML = '<div style="padding:20px; color:red; font-family:sans-serif;">未检测到 React 组件。请确保主组件名为 App 或以大写字母开头。</div>';
  }
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
})();`
    }

    const scriptTag = `<script type="${scriptType}" data-presets="react,typescript" id="project-scripts">${scriptContent}</script>`

    if (combined.includes('</body>')) {
      combined = combined.replace('</body>', scriptTag + '</body>')
    } else {
      combined += scriptTag
    }

    return combined
  }

  const downloadProjectAsZip = async () => {
    if (!files.length) return
    
    const zip = new JSZip()
    files.forEach((file) => {
      // 这里的 file.name 可能包含路径，如 src/App.tsx
      zip.file(file.name, file.content)
    })
    
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const safeTitle = (activeArtifact.title || 'project')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 50) || 'project_export'
      
    triggerDownload(content, `${safeTitle}.zip`)
  }

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
      wb.SheetNames.push("Sheet1")
      wb.Sheets["Sheet1"] = ws
    }
    // 情况 3: 单个普通 JSON 对象
    else if (typeof json === 'object') {
      const ws = XLSX.utils.json_to_sheet([json])
      wb.SheetNames.push("Sheet1")
      wb.Sheets["Sheet1"] = ws
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

  const _exportToWord = async () => {
    if (!activeArtifact) return
    const htmlContent = compileMarkdownToWordHtml(activeArtifact.code)
    const blob = await asBlob(htmlContent)
    const safeTitle = (activeArtifact.title || 'artifact')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 50) || 'document_export'
    
    triggerDownload(blob as Blob, `${safeTitle}.docx`)
  }

  const _exportToExcel = async () => {
    if (!activeArtifact) return
    const wbout = await convertToExcelBuffer(activeArtifact.code)
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    const safeTitle = (activeArtifact.title || 'artifact')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 50) || 'data_export'
      
    triggerDownload(blob, `${safeTitle}.xlsx`)
  }

  const downloadCurrentFile = async () => {
    if (!activeFile) return
    const lang = activeFile.language?.toLowerCase() || 'text'
    
    const safeName = (activeFile.name || 'file')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .split('.')[0] || 'file'

    if (lang === 'docx') {
      const htmlContent = compileMarkdownToWordHtml(activeFile.content)
      const blob = await asBlob(htmlContent)
      triggerDownload(blob as Blob, `${safeName}.docx`)
      return
    }

    if (lang === 'xlsx') {
      const wbout = await convertToExcelBuffer(activeFile.content)
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      triggerDownload(blob, `${safeName}.xlsx`)
      return
    }
    
    // 扩展名与 MIME 映射
    const extMap: Record<string, { ext: string; mime: string }> = {
      html: { ext: 'html', mime: 'text/html' },
      css: { ext: 'css', mime: 'text/css' },
      json: { ext: 'json', mime: 'application/json' },
      javascript: { ext: 'js', mime: 'application/javascript' },
      js: { ext: 'js', mime: 'application/javascript' },
      typescript: { ext: 'ts', mime: 'application/typescript' },
      ts: { ext: 'ts', mime: 'application/typescript' },
      jsx: { ext: 'jsx', mime: 'application/javascript' },
      tsx: { ext: 'tsx', mime: 'application/typescript' },
      javascriptreact: { ext: 'jsx', mime: 'application/javascript' },
      typescriptreact: { ext: 'tsx', mime: 'application/typescript' },
      react: { ext: 'jsx', mime: 'application/javascript' },
      markdown: { ext: 'md', mime: 'text/markdown' },
      md: { ext: 'md', mime: 'text/markdown' },
      svg: { ext: 'svg', mime: 'image/svg+xml' },
    }

    const config = extMap[lang] || { ext: lang, mime: 'text/plain' }
    const blob = new Blob([activeFile.content], { type: `${config.mime};charset=utf-8` })
    const filename = `${safeName}.${config.ext}`
    triggerDownload(blob, filename)
  }

  const openInNewWindow = () => {
    let finalHtml = ''
    const isWebProject = files.some(f => 
      ['html', 'svg', 'javascript', 'js', 'css', 'typescript', 'ts', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact', 'react'].includes(f.language.toLowerCase())
    )

    if (viewMode === 'preview' && isWebProject) {
      finalHtml = getCombinedHtml()
    } else {
      const language = activeFile.language.toLowerCase()
      if (['html', 'svg'].includes(language)) {
        finalHtml = activeFile.content
      } else {
        // 对于代码或文档，包裹一个简单的预览层
        finalHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>${activeFile.name}</title>
              <style>body { font-family: monospace; padding: 20px; white-space: pre; background: #f8f9fa; }</style>
            </head>
            <body>${activeFile.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
          </html>
        `
      }
    }
    
    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const _getIcon = (lang: string) => {
    if (lang === 'ppt') return <Presentation className="size-4 text-orange-500" />
    if (lang === 'html' || lang === 'svg') return <Globe className="size-4 text-blue-500" />
    if (lang === 'mermaid') return <Code2 className="size-4 text-green-500" />
    return <Code2 className="size-4 text-indigo-500" />
  }

  const renderContent = () => {
    const { language, content } = activeFile
    const normalizedLang = language.toLowerCase()
    
    // 只要项目中包含 Web 相关文件，就允许进入 Combined Preview
    const isWebProject = files.some(f => 
      ['html', 'svg', 'javascript', 'js', 'css', 'typescript', 'ts', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact', 'react'].includes(f.language.toLowerCase())
    )

    if (viewMode === 'preview') {
      if (isWebProject) {
        return (
          <iframe
            srcDoc={getCombinedHtml()}
            className="w-full h-full border-0 bg-card"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            title="Project Preview"
          />
        )
      }
      if (language === 'ppt') {
        return <PptRenderer data={content} />
      }
      if (language === 'docx') {
        if (docMode === 'edit') {
          const editContent = docxEditHtml || (content.trim().startsWith('<') ? content : '<p>文档内容转换中...</p>')
          return (
            <div className="h-full">
              <DocumentEditor initialContent={editContent} />
            </div>
          )
        }
        if (content.trim().startsWith('<')) {
          return (
            <div className="h-full overflow-auto bg-white dark:bg-zinc-950 p-8">
              <div className="max-w-4xl mx-auto prose prose-sm sm:prose lg:prose-lg" dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          )
        }
        return (
          <div className="h-full overflow-auto bg-zinc-100 dark:bg-zinc-900/50 p-8 flex justify-center">
            <div className="bg-white dark:bg-zinc-950 shadow-lg border border-zinc-200 dark:border-zinc-800 p-12 max-w-3xl w-full min-h-[600px] rounded-sm text-zinc-900 dark:text-zinc-100 prose prose-sm sm:prose dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )
      }
      if (language === 'xlsx') {
        try {
          const parsed = JSON.parse(content)
          if (parsed.sheets) {
            const wbData = createEmptyWorkbook(parsed.sheets)
            return <ExcelPreview data={wbData} />
          }
        } catch {}
        const encoder = new TextEncoder()
        return <ExcelPreview data={encoder.encode(content).buffer} />
      }
      if (language === 'mermaid') {
        return <div className="p-4 bg-card h-full overflow-auto"><MermaidRenderer code={content} /></div>
      }
      if (language === 'html' || language === 'svg') {
        return (
          <iframe
            srcDoc={content}
            className="w-full h-full border-0 bg-card"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            title="Artifact Preview"
          />
        )
      }
    }

    // Default Code View
    return (
      <div className="flex-1 h-full bg-zinc-50 dark:bg-card overflow-hidden">
        <SyntaxHighlighter
          language={normalizedLang}
          style={oneLight}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: '2rem 1.5rem',
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.7',
            height: '100%',
          }}
          PreTag="div"
        >
          {content}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <div className="h-full w-full lg:w-[50%] lg:relative absolute inset-0 z-50 flex flex-col border-l border-border dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shadow-xl transition-all duration-300 overflow-hidden shrink-0">
      
      {/* ── 顶部 Tabs 栏 (仿 Trae 风格) ── */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-border/50 dark:border-zinc-800">
          {isDocumentType ? (
            <>
              <button
                onClick={() => isDocxDocument ? handleDocModeSwitch('preview') : setViewMode('preview')}
                disabled={docxConverting}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  (isDocxDocument ? docMode === 'preview' : viewMode === 'preview')
                    ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {docxConverting ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                {t('Preview')}
              </button>
              <button
                onClick={() => isDocxDocument ? handleDocModeSwitch('edit') : setViewMode('code')}
                disabled={docxConverting}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  (isDocxDocument ? docMode === 'edit' : viewMode === 'code')
                    ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Edit3 className="size-3.5" />
                {t('Edit')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Monitor className="size-3.5" /> {t('Preview')}
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'code'
                    ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="size-3.5" /> {t('Code')}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <button 
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-indigo-600 dark:text-indigo-400" 
            title={files.length > 1 ? t("Download project (.zip)") : t("Download current file")} 
            onClick={files.length > 1 ? downloadProjectAsZip : downloadCurrentFile}
          >
            <Download className="size-4" />
          </button>
          <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors" title={t("Open in new window")} onClick={openInNewWindow}>
            <ExternalLink className="size-4" />
          </button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
          <button 
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors" 
            title={t("Close panel")}
            onClick={() => setActiveArtifact(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* ── 主内容布局 (Sidebar + Content) ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Files Sidebar */}
        {files.length > 1 && sidebarVisible && (
          <div className="w-64 md:w-48 border-r border-border dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-col shrink-0 animate-in slide-in-from-left duration-300 hidden md:flex">
            <div className="p-4 pb-2 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Files</span>
              <button 
                onClick={() => setSidebarVisible(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-muted-foreground"
              >
                <PanelLeft className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-none">
              {tree.map((item, i) => (
                <FileTreeNode 
                  key={i} 
                  item={item} 
                  activeFileIndex={activeFileIndex} 
                  onSelect={(idx) => {
                    setActiveFileIndex(idx)
                    setViewMode('code') // Switch to code view when a file is selected
                  }} 
                />
              ))}
            </div>
          </div>
        )}

        {/* Restore Sidebar Button */}
        {files.length > 1 && !sidebarVisible && (
          <button
            onClick={() => setSidebarVisible(true)}
            className="absolute left-0 top-20 z-10 p-2 bg-white dark:bg-zinc-900 border border-l-0 border-border dark:border-zinc-800 rounded-r-xl text-muted-foreground hover:text-indigo-500 shadow-sm transition-all"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        {/* Content Area */}
        <div className="flex-1 relative flex flex-col bg-dot-pattern overflow-hidden bg-card dark:bg-card">
          {/* Sub-header for current file name */}
          {viewMode === 'code' && (
            <div className="h-10 flex items-center px-6 border-b border-border dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
               <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <File className="size-3.5" />
                  <span>{activeFile.name}</span>
               </div>
            </div>
          )}
          
          <div className="flex-1 overflow-auto app-scrollbar">
             {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
