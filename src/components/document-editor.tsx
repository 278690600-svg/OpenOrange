import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { useCallback, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListTodo, Quote, Code, Minus,
  Image as ImageIcon, Table as TableIcon, Link as LinkIcon,
  Undo, Redo, Type, Highlighter, Palette, Heading1, Heading2, Heading3,
  ChevronDown, Save, Download, Upload, FileText, Printer, Search,
  Sparkles, Loader2, Eye, Settings, Columns, FileDown, ZoomIn, ZoomOut,
  Maximize2, X, Check
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export interface DocumentSettings {
  fontSize: string
  fontFamily: string
  lineHeight: string
  margin: 'narrow' | 'normal' | 'wide'
  pageSize: 'A4' | 'A3' | 'Letter'
  orientation: 'portrait' | 'landscape'
  columns: number
}

interface DocumentEditorProps {
  initialContent?: string
  onSave?: (content: string, wordCount: number) => void
  autoSave?: boolean
  readOnly?: boolean
}

export function DocumentEditor({
  initialContent,
  onSave,
  autoSave = true,
  readOnly = false
}: DocumentEditorProps) {
  const { t } = useI18n()
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAiMenu, setShowAiMenu] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [wordCount, setWordCount] = useState(0)
  const [settings, setSettings] = useState<DocumentSettings>({
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: '1.6',
    margin: 'normal',
    pageSize: 'A4',
    orientation: 'portrait',
    columns: 1
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true }),
      Placeholder.configure({ placeholder: t('Start typing or press "/" for commands...') }),
      Typography,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color
    ],
    content: initialContent,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none'
      }
    }
  })

  useEffect(() => {
    if (!editor) return
    const updateCount = () => {
      const text = editor.getText()
      const words = text.trim().split(/\s+/).filter(w => w.length > 0).length
      setWordCount(words)
    }
    editor.on('update', updateCount)
    updateCount()
    return () => { editor.off('update', updateCount) }
  }, [editor])

  useEffect(() => {
    if (!editor || !autoSave) return
    const timer = setInterval(() => {
      const content = editor.getHTML()
      if (content && content !== '<p></p>') {
        handleSave()
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [editor, autoSave])

  const handleSave = useCallback(async () => {
    if (!editor || isSaving) return
    setIsSaving(true)
    try {
      const content = editor.getHTML()
      if (onSave) {
        onSave(content, wordCount)
      }
      setLastSaved(new Date())
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [editor, wordCount, onSave, isSaving])

  const handleAiAssist = useCallback(async (action: string) => {
    if (!editor) return
    setAiLoading(true)
    try {
      const selection = editor.state.selection
      const selectedText = editor.state.doc.textBetween(selection.from, selection.to, ' ')
      const textToProcess = selectedText || editor.getText().slice(0, 500)

      const res = await fetch('/api/documents?action=ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text: textToProcess })
      })
      const data = await res.json()

      if (data.result) {
        if (selectedText) {
          editor.commands.insertContent(data.result)
        } else {
          editor.commands.insertContent(data.result)
        }
      }
    } catch (err) {
      console.error('AI assist failed:', err)
    } finally {
      setAiLoading(false)
      setShowAiMenu(false)
    }
  }, [editor])

  const handleFindReplace = useCallback(() => {
    if (!editor || !findText) return
    const { doc } = editor.state
    const text = doc.textBetween(0, doc.content.size, '\n')
    const regex = new RegExp(findText, 'gi')

    if (replaceText) {
      let pos = 0
      let match
      const transaction = editor.state.tr
      while ((match = regex.exec(text)) !== null) {
        const from = match.index
        const to = from + match[0].length
        transaction.replaceWith(from, to, editor.schema.text(replaceText))
      }
      editor.view.dispatch(transaction)
    } else {
      const match = regex.exec(text)
      if (match) {
        editor.commands.setTextSelection({ from: match.index, to: match.index + match[0].length })
      }
    }
  }, [editor, findText, replaceText])

  const handleExport = useCallback(async (format: 'docx' | 'html' | 'md' | 'pdf') => {
    if (!editor) return
    try {
      const res = await fetch('/api/documents?action=export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editor.getHTML(),
          title: 'document',
          format
        })
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `document.${format === 'docx' ? 'docx' : format === 'html' ? 'html' : format === 'md' ? 'md' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [editor])

  const handleImport = useCallback(async (file: File) => {
    if (!editor) return
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/documents?action=import', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (data.content) {
        editor.commands.setContent(data.content)
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }, [editor])

  const handlePrint = useCallback(() => {
    if (!editor) return
    const content = editor.getHTML()
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Document</title>
            <style>
              body { font-family: system-ui; padding: 40px; line-height: 1.6; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>${content}</body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }, [editor])

  const marginClasses = {
    narrow: 'px-4 py-2',
    normal: 'px-8 py-4',
    wide: 'px-16 py-8'
  }

  if (!editor) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Top Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-x-auto">
        {/* History buttons */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t('Undo')}>
            <Undo className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t('Redo')}>
            <Redo className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Text style */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })} title={t('Heading 1')}>
            <Heading1 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })} title={t('Heading 2')}>
            <Heading2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })} title={t('Heading 3')}>
            <Heading3 className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Format */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')} title={t('Bold')}>
            <Bold className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')} title={t('Italic')}>
            <Italic className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')} title={t('Underline')}>
            <UnderlineIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')} title={t('Strikethrough')}>
            <Strikethrough className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')} title={t('Highlight')}>
            <Highlighter className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Alignment */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })} title={t('Align Left')}>
            <AlignLeft className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })} title={t('Align Center')}>
            <AlignCenter className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })} title={t('Align Right')}>
            <AlignRight className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            active={editor.isActive({ textAlign: 'justify' })} title={t('Justify')}>
            <AlignJustify className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Lists */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')} title={t('Bullet List')}>
            <List className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')} title={t('Ordered List')}>
            <ListOrdered className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive('taskList')} title={t('Task List')}>
            <ListTodo className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Insert */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => {
            const url = prompt('Enter image URL:')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }} title={t('Insert Image')}>
            <ImageIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => {
            const url = prompt('Enter URL:')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }} active={editor.isActive('link')} title={t('Insert Link')}>
            <LinkIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => {
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }} title={t('Insert Table')}>
            <TableIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')} title={t('Quote')}>
            <Quote className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')} title={t('Code Block')}>
            <Code className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t('Horizontal Rule')}>
            <Minus className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {/* AI Assist */}
          <div className="relative">
            <ToolbarButton onClick={() => setShowAiMenu(!showAiMenu)}
              className="text-purple-500 hover:text-purple-600" title={t('AI Assist')}>
              {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            </ToolbarButton>
            {showAiMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 py-1">
                {[
                  { id: 'continue', label: t('Continue Writing') },
                  { id: 'summarize', label: t('Summarize') },
                  { id: 'improve', label: t('Improve Writing') },
                  { id: 'translate-zh', label: t('Translate to Chinese') },
                  { id: 'translate-en', label: t('Translate to English') },
                  { id: 'expand', label: t('Expand') },
                  { id: 'shorten', label: t('Shorten') }
                ].map(item => (
                  <button key={item.id} onClick={() => handleAiAssist(item.id)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700">
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ToolbarButton onClick={() => setShowFindReplace(!showFindReplace)} title={t('Find & Replace')}>
            <Search className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowSettings(!showSettings)} title={t('Page Settings')}>
            <Settings className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={handlePrint} title={t('Print')}>
            <Printer className="size-3.5" />
          </ToolbarButton>

          {/* Export dropdown */}
          <div className="relative group">
            <ToolbarButton title={t('Export')}>
              <Download className="size-3.5" />
            </ToolbarButton>
            <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 py-1 hidden group-hover:block">
              {(['docx', 'html', 'md', 'pdf'] as const).map(format => (
                <button key={format} onClick={() => handleExport(format)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 uppercase">
                  {format}
                </button>
              ))}
            </div>
          </div>

          <label className="cursor-pointer">
            <input type="file" accept=".docx,.html,.md,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
            <ToolbarButton asChild title={t('Import')}>
              <Upload className="size-3.5" />
            </ToolbarButton>
          </label>

          <ToolbarButton onClick={handleSave}
            className={isSaving ? 'text-zinc-400' : 'text-green-500 hover:text-green-600'}
            title={t('Save')}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </ToolbarButton>
        </div>
      </div>

      {/* Find & Replace bar */}
      {showFindReplace && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
          <input value={findText} onChange={e => setFindText(e.target.value)}
            placeholder={t('Find...')} className="flex-1 text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900" />
          <input value={replaceText} onChange={e => setReplaceText(e.target.value)}
            placeholder={t('Replace...')} className="flex-1 text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900" />
          <button onClick={handleFindReplace} className="px-2 py-1 text-xs rounded bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600">
            {replaceText ? t('Replace All') : t('Find')}
          </button>
          <button onClick={() => setShowFindReplace(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Page Settings panel */}
      {showSettings && (
        <div className="absolute right-4 top-20 w-72 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 p-4 space-y-3">
          <h4 className="text-sm font-semibold">{t('Page Settings')}</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-500">{t('Font Size')}</label>
              <select value={settings.fontSize} onChange={e => setSettings({ ...settings, fontSize: e.target.value })}
                className="w-full text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                {['12px', '14px', '16px', '18px', '20px'].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">{t('Line Height')}</label>
              <select value={settings.lineHeight} onChange={e => setSettings({ ...settings, lineHeight: e.target.value })}
                className="w-full text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                {['1.2', '1.4', '1.6', '1.8', '2.0'].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">{t('Margin')}</label>
              <select value={settings.margin} onChange={e => setSettings({ ...settings, margin: e.target.value as any })}
                className="w-full text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                <option value="narrow">{t('Narrow')}</option>
                <option value="normal">{t('Normal')}</option>
                <option value="wide">{t('Wide')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">{t('Columns')}</label>
              <select value={settings.columns} onChange={e => setSettings({ ...settings, columns: Number(e.target.value) })}
                className="w-full text-xs rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                {[1, 2, 3].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto p-8 bg-zinc-100 dark:bg-zinc-900">
        <div className={`max-w-4xl mx-auto bg-white dark:bg-zinc-800 shadow-sm rounded-lg ${marginClasses[settings.margin]} min-h-[800px]`}
          style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] text-zinc-500">
        <div className="flex items-center gap-3">
          <span>{wordCount} {t('words')}</span>
          <span>{editor?.state.doc.textContent.length || 0} {t('characters')}</span>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="flex items-center gap-1">
              <Check className="size-2.5" /> {t('Saved')} {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
              <ZoomOut className="size-3" />
            </button>
            <span className="w-8 text-center">{zoom}%</span>
            <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
              <ZoomIn className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ children, onClick, active, disabled, className, title, asChild }: {
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
  title?: string
  asChild?: boolean
}) {
  const Comp = asChild ? 'span' : 'button'
  return (
    <Comp onClick={onClick} disabled={disabled} title={title}
      className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors
        ${active ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'} ${className || ''}`}>
      {children}
    </Comp>
  )
}
