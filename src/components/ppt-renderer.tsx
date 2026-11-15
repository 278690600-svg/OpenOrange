"use client"

import React, { useState, useEffect, useRef } from "react"
import PptxGenJS from "pptxgenjs"
import { Download, Presentation, Layout as LayoutIcon, FileText, ChevronLeft, ChevronRight, Palette, Loader2, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PptBlock {
  type: 'text' | 'image' | 'shape' | 'list'
  content?: string | string[]
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  fontWeight?: string | number
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  opacity?: number
  borderRadius?: number
  fill?: string
  stroke?: string
  zIndex?: number
  imageUrl?: string
}

export interface PptSlide {
  title: string
  subtitle?: string
  content?: string[] | string
  leftContent?: string[] | string
  rightContent?: string[] | string
  layout?: "title" | "bullet" | "two_column" | "hero" | "image" | "section" | "quote" | "kpi" | "three_column" | "image_left" | "image_right" | "custom"
  imageUrl?: string
  notes?: string
  blocks?: PptBlock[]
  background?: string
  backgroundUrl?: string
  accentColor?: string
}

export interface PptData {
  title: string
  author?: string
  company?: string
  theme?: "zinc" | "orange" | "blue" | "green" | "rose"
  style?: "modern" | "pencil" | "gradient" | "brutalism" | "swiss" | "apple" | "editorial"
  slides: PptSlide[]
  background?: string
}

const THEMES = {
  zinc: { primary: "18181b", secondary: "71717a", accent: "3f3f46", bg: "ffffff" },
  orange: { primary: "ea580c", secondary: "f97316", accent: "ffedd5", bg: "ffffff" },
  blue: { primary: "2563eb", secondary: "3b82f6", accent: "dbeafe", bg: "ffffff" },
  green: { primary: "16a34a", secondary: "22c55e", accent: "dcfce7", bg: "ffffff" },
  rose: { primary: "e11d48", secondary: "f43f5e", accent: "ffe4e6", bg: "ffffff" },
}

/**
 * Simple partial JSON parser to handle streaming
 */
function parsePartial(str: string): PptData | null {
  if (!str || str.length < 5) return null
  try {
    return JSON.parse(str)
  } catch (e) {
    let jsonStr = str.trim()
    const start = jsonStr.indexOf('{')
    if (start === -1) return null
    jsonStr = jsonStr.substring(start)

    let openBraces = 0
    let openBrackets = 0
    let inString = false
    
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i]
      if (char === '"' && (i === 0 || jsonStr[i-1] !== '\\')) inString = !inString
      if (!inString) {
        if (char === '{') openBraces++
        else if (char === '}') openBraces--
        else if (char === '[') openBrackets++
        else if (char === ']') openBrackets--
      }
    }
    
    let repaired = jsonStr
    try {
      if (inString) repaired += '"'
      while (openBrackets > 0) { repaired += ']'; openBrackets-- }
      while (openBraces > 0) { repaired += '}'; openBraces-- }
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }
}

const EditableText = ({ value, onChange, className, style, multiline = false, placeholder }: any) => {
  const [isEditing, setIsEditing] = React.useState(false)
  const elRef = React.useRef<any>(null)
  
  // 判断内容是否为空
  const isEmpty = !value || String(value).trim() === ''
  
  const handleFocus = () => {
    setIsEditing(true)
    if (isEmpty && elRef.current) {
      elRef.current.innerHTML = ''
    }
  }

  const handleBlur = (e: any) => {
    setIsEditing(false)
    const newVal = e.target.innerText.trim()
    if (newVal !== value) {
      onChange(newVal)
    }
  }

  // 渲染的 HTML：非编辑且为空时渲染精美斜体提示文本，否则渲染真实内容
  const displayHtml = !isEditing && isEmpty 
    ? `<span style="opacity: 0.55; font-style: italic; font-weight: 400; font-size: 0.85em;">${placeholder || '点击输入内容...'}</span>`
    : (value || '')

  return React.createElement(
    multiline ? 'div' : 'span',
    {
      ref: elRef,
      className: `${className || ''} ${
        isEditing 
          ? 'outline-none ring-2 ring-orange-500/50 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.15)] border-orange-500/30' 
          : isEmpty 
            ? 'border border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-0.5 bg-zinc-500/5 hover:bg-zinc-500/10'
            : 'hover:outline-none hover:ring-1 hover:ring-zinc-400/50 px-1 hover:bg-zinc-500/5'
      } rounded transition-all duration-300 cursor-text inline-block min-h-[1.2em] align-middle`,
      style: { 
        ...style, 
        display: multiline ? 'block' : 'inline-block', 
        minWidth: isEmpty ? '120px' : '40px'
      },
      contentEditable: true,
      suppressContentEditableWarning: true,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          elRef.current?.blur()
        }
      },
      dangerouslySetInnerHTML: { __html: displayHtml }
    }
  )
}

const SlideView = ({ slide, layout, theme, currentSlide, pptData, onUpdateSlide, onTriggerAiCommand }: any) => {
  const current = slide;
  const [selectionCoords, setSelectionCoords] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [aiPrompt, setAiPrompt] = useState("")
  const [isAiBoxOpen, setIsAiBoxOpen] = useState(false)
  const slideRef = useRef<HTMLDivElement>(null)

  const getResponsiveFontSize = (text: any, baseClass: string, maxLength: number) => {
    const totalLength = Array.isArray(text) ? text.join("").length : String(text || "").length
    if (totalLength > maxLength) {
      if (totalLength > maxLength * 1.8) {
        return "text-[11px] sm:text-xs leading-snug line-clamp-[6]"
      }
      return "text-xs sm:text-sm leading-normal line-clamp-[8]"
    }
    return baseClass
  }

  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      if (!isAiBoxOpen) {
        setSelectionCoords(null)
        setSelectedText("")
      }
      return
    }
    const text = selection.toString().trim()
    if (text.length > 0 && slideRef.current) {
      try {
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const slideRect = slideRef.current.getBoundingClientRect()
        
        setSelectionCoords({
          x: Math.min(slideRect.width - 140, Math.max(140, rect.left - slideRect.left + (rect.width / 2))),
          y: Math.max(30, rect.top - slideRect.top - 45)
        })
        setSelectedText(text)
      } catch (e) {}
    }
  }

  const handleSendAiCommand = () => {
    if (!aiPrompt.trim()) return
    if (onTriggerAiCommand) {
      onTriggerAiCommand({
        text: selectedText,
        command: aiPrompt,
        slideIndex: currentSlide
      })
    }
    setIsAiBoxOpen(false)
    setSelectionCoords(null)
    setSelectedText("")
    setAiPrompt("")
  }

  return (
    <div 
      ref={slideRef}
      onMouseUp={handleMouseUp}
      className={`w-full h-full shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col relative transition-all duration-500 ease-out style-${pptData.style || "modern"}`}
      style={{ 
        "--theme-primary": `#${theme.primary}`,
        "--theme-secondary": `#${theme.secondary}`,
        "--theme-accent": `#${theme.accent}`,
        backgroundColor: current?.background || pptData.background,
        backgroundImage: current?.backgroundUrl ? `url(/api/proxy-image?url=${encodeURIComponent(current.backgroundUrl)})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } as React.CSSProperties}
    >
       {/* 划词 AI 悬浮球 & 磨砂输入框 */}
       {selectionCoords && (
         <div 
           className="absolute z-[99] -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-200"
           style={{ left: `${selectionCoords.x}px`, top: `${selectionCoords.y}px` }}
         >
           {!isAiBoxOpen ? (
             <Button 
               size="sm" 
               type="button"
               className="h-8 rounded-full bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center gap-1.5 shadow-[0_10px_20px_rgba(234,88,12,0.3)] hover:shadow-[0_10px_25px_rgba(234,88,12,0.5)] border border-orange-500/20 px-3 text-[11px] hover:scale-105 transition-all"
               onClick={() => setIsAiBoxOpen(true)}
             >
               <Presentation className="size-3 text-white/90 animate-pulse" />
               <span>AI 微调</span>
             </Button>
           ) : (
             <div className="bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border border-orange-500/30 rounded-xl p-2.5 shadow-2xl flex flex-col gap-2 w-64 animate-in zoom-in-95 duration-150">
               <div className="text-[9px] text-zinc-400 font-semibold truncate flex items-center gap-1">
                 <span className="w-1 h-1 rounded-full bg-orange-500"></span>
                 已选段落: "{selectedText}"
               </div>
               <div className="flex gap-1">
                 <input 
                   type="text" 
                   autoFocus
                   placeholder="输入微调指令..." 
                   value={aiPrompt}
                   onChange={e => setAiPrompt(e.target.value)}
                   className="flex-1 h-7 text-[10px] rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 outline-none focus:border-orange-500/50"
                   onKeyDown={e => {
                     if (e.key === 'Enter') handleSendAiCommand()
                   }}
                 />
                 <Button 
                   size="sm" 
                   className="h-7 px-2.5 bg-orange-600 hover:bg-orange-700 text-white text-[10px]"
                   onClick={handleSendAiCommand}
                 >
                   确定
                 </Button>
               </div>
               <div className="flex justify-end gap-1.5 text-[8px] text-zinc-400">
                 <button onClick={() => { setIsAiBoxOpen(false); setSelectionCoords(null); }} className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">取消</button>
               </div>
             </div>
           )}
         </div>
       )}

       {layout === "title" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-3xl sm:text-4xl', 30)} font-black mb-6 leading-tight tracking-tight`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            {current?.subtitle && <EditableText className="text-lg sm:text-xl text-zinc-500 font-medium italic" value={current.subtitle} onChange={(val: any) => onUpdateSlide(currentSlide, 'subtitle', val)} />}
            <div className="w-16 h-1 mt-8 rounded-full" style={{ backgroundColor: `var(--theme-primary)` }} />
          </div>
       ) : layout === "hero" ? (
          <div className="h-full flex gap-10 animate-in fade-in duration-500">
            <div className="w-1/3 p-6 flex items-center rounded-xl" style={{ backgroundColor: `var(--theme-primary)` }}>
              <EditableText className={`${getResponsiveFontSize(current?.title, 'text-xl sm:text-2xl', 25)} font-black text-white leading-tight`} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            </div>
            <div className="flex-1 flex items-center">
              <div className="space-y-4 w-full">
                 {Array.isArray(current?.content) || typeof current?.content === 'string' ? (
                   <div className="w-full">
                     {Array.isArray(current.content) ? (
                       <ul className="list-disc list-inside space-y-3 text-zinc-600 dark:text-zinc-300">
                         {current.content.map((item:any, i:any) => <li key={i} className={`${getResponsiveFontSize(item, 'text-sm sm:text-base', 60)} font-medium`}><EditableText value={item} onChange={(val: any) => { const arr = [...current.content]; arr[i] = val; onUpdateSlide(currentSlide, 'content', arr) }} /></li>)}
                       </ul>
                     ) : (
                       <EditableText className={`${getResponsiveFontSize(current?.content, 'text-base', 120)} text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium`} multiline value={current?.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />
                     )}
                   </div>
                 ) : null}
              </div>
            </div>
          </div>
       ) : layout === "image_left" || layout === "image_right" ? (
          <div className="h-full flex flex-col animate-in fade-in duration-500">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-2xl', 35)} font-black mb-8 tracking-tight`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            <div className="flex-1 grid grid-cols-2 gap-10">
              {layout === "image_left" && (
                <div className="h-full rounded-2xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 animate-pulse-fade flex items-center justify-center relative group/img">
                  {current?.imageUrl ? <img src={`/api/proxy-image?url=${encodeURIComponent(current.imageUrl)}`} alt={current.title} className="absolute inset-0 w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700" /> : <div className="text-zinc-500">No Image Provided</div>}
                </div>
              )}
              <div className="space-y-4 pr-2 overflow-y-auto custom-scrollbar flex flex-col justify-center">
                 {Array.isArray(current?.content) ? (
                   <ul className="list-disc list-inside space-y-3 text-zinc-600 dark:text-zinc-300">
                     {current.content.map((item:any, i:any) => <li key={i} className={`${getResponsiveFontSize(item, 'text-sm sm:text-base', 80)} font-medium`}><EditableText value={item} onChange={(val: any) => { const arr = [...current.content]; arr[i] = val; onUpdateSlide(currentSlide, 'content', arr) }} /></li>)}
                   </ul>
                 ) : (
                   <EditableText className={`${getResponsiveFontSize(current?.content, 'text-sm sm:text-base', 160)} text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium`} multiline value={current?.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />
                 )}
              </div>
              {layout === "image_right" && (
                <div className="h-full rounded-2xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 animate-pulse-fade flex items-center justify-center relative group/img">
                  {current?.imageUrl ? <img src={`/api/proxy-image?url=${encodeURIComponent(current.imageUrl)}`} alt={current.title} className="absolute inset-0 w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700" /> : <div className="text-zinc-500">No Image Provided</div>}
                </div>
              )}
            </div>
          </div>
       ) : layout === "two_column" ? (
          <div className="h-full flex flex-col animate-in fade-in duration-500">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-2xl', 40)} font-black mb-8 border-l-4 pl-4`} style={{ borderColor: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            <div className="flex-1 grid grid-cols-2 gap-10">
              <div className="space-y-3">
                 {Array.isArray(current?.leftContent || current?.content) ? (
                   <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300">
                     {((current?.leftContent || current?.content) as any[]).map((v, i) => <li key={i} className={`${getResponsiveFontSize(v, 'text-xs sm:text-sm', 80)} font-medium`}><EditableText value={v} onChange={(val: any) => { const prop = current?.leftContent ? 'leftContent' : 'content'; const arr = [...(current[prop] || [])]; arr[i] = val; onUpdateSlide(currentSlide, prop, arr) }} /></li>)}
                   </ul>
                 ) : <EditableText className={`${getResponsiveFontSize(current?.leftContent || current?.content, 'text-xs sm:text-sm', 160)} text-zinc-600 dark:text-zinc-300 font-medium`} multiline value={String(current?.leftContent || current?.content || "")} onChange={(val: any) => onUpdateSlide(currentSlide, current?.leftContent ? 'leftContent' : 'content', val)} />}
              </div>
              <div className="space-y-3">
                 {Array.isArray(current?.rightContent) ? (
                   <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300">
                     {current.rightContent.map((v:any, i:any) => <li key={i} className={`${getResponsiveFontSize(v, 'text-xs sm:text-sm', 80)} font-medium`}><EditableText value={v} onChange={(val: any) => { const arr = [...(current?.rightContent || [])]; arr[i] = val; onUpdateSlide(currentSlide, 'rightContent', arr) }} /></li>)}
                   </ul>
                 ) : <EditableText className={`${getResponsiveFontSize(current?.rightContent, 'text-xs sm:text-sm', 160)} text-zinc-600 dark:text-zinc-300 font-medium`} multiline value={current?.rightContent} onChange={(val: any) => onUpdateSlide(currentSlide, 'rightContent', val)} />}
              </div>
            </div>
          </div>
       ) : layout === "section" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="px-6 py-2 rounded-full mb-6 font-bold tracking-widest uppercase text-sm" style={{ backgroundColor: `var(--theme-accent)`, color: `var(--theme-primary)` }}><EditableText value={current?.subtitle || "Next"} onChange={(val: any) => onUpdateSlide(currentSlide, 'subtitle', val)} /></div>
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-4xl sm:text-5xl', 35)} font-black mb-6 leading-tight tracking-tight`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            {current?.content && <EditableText className={`${getResponsiveFontSize(current.content, 'text-xl', 120)} text-zinc-500 font-medium max-w-2xl`} multiline value={current.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />}
          </div>
       ) : layout === "quote" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-500 max-w-4xl mx-auto">
            <span className="text-8xl font-serif text-zinc-200 dark:text-zinc-800 absolute top-10 left-10 opacity-50">"</span>
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-2xl sm:text-3xl', 100)} font-bold mb-8 leading-relaxed italic text-zinc-700 dark:text-zinc-300 relative z-10`} multiline value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            {current?.subtitle && <div className="text-xl font-black uppercase tracking-widest" style={{ color: `var(--theme-primary)` }}>— <EditableText value={current.subtitle} onChange={(val: any) => onUpdateSlide(currentSlide, 'subtitle', val)} /></div>}
            {current?.content && <EditableText className="text-sm text-zinc-400 mt-2 font-medium" value={current.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />}
          </div>
       ) : layout === "kpi" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-6xl sm:text-[100px]', 15)} font-black tracking-tighter mb-4`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            {current?.subtitle && <EditableText className="text-2xl sm:text-3xl font-bold text-zinc-800 dark:text-zinc-200 mb-6" value={current.subtitle} onChange={(val: any) => onUpdateSlide(currentSlide, 'subtitle', val)} />}
            {current?.content && <EditableText className={`${getResponsiveFontSize(current.content, 'text-lg', 120)} text-zinc-500 font-medium max-w-2xl`} value={current.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />}
          </div>
       ) : layout === "three_column" ? (
          <div className="h-full flex flex-col animate-in fade-in duration-500">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-2xl', 40)} font-black mb-10 tracking-tight`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            <div className="flex-1 grid grid-cols-3 gap-8">
              {(Array.isArray(current?.content) ? current.content.slice(0,3) : [String(current?.content)]).map((item: any, i: number) => (
                <div key={i} className="flex flex-col gap-4 p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 relative overflow-hidden group/card shadow-sm hover:shadow-lg transition-all">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: `var(--theme-primary)` }} />
                  <div className="size-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0" style={{ backgroundColor: `var(--theme-accent)`, color: `var(--theme-primary)` }}>0{i+1}</div>
                  <EditableText className={`${getResponsiveFontSize(item, 'text-sm sm:text-base', 80)} text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed`} multiline value={item} onChange={(val: any) => { const arr = [...(current?.content || [])]; arr[i] = val; onUpdateSlide(currentSlide, 'content', arr) }} />
                </div>
              ))}
            </div>
          </div>
       ) : (
          <div className="h-full flex flex-col animate-in fade-in duration-500">
            <EditableText className={`${getResponsiveFontSize(current?.title, 'text-2xl', 40)} font-black mb-2 tracking-tight`} style={{ color: `var(--theme-primary)` }} value={current?.title} onChange={(val: any) => onUpdateSlide(currentSlide, 'title', val)} />
            <div className="w-8 h-1 mb-8 rounded-full" style={{ backgroundColor: `var(--theme-primary)` }} />
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar focus:outline-none">
              {Array.isArray(current?.content) ? (
                <ul className="space-y-4">
                  {current.content.map((item:any, i:any) => (
                    <li key={i} className="flex items-start gap-4 group/item">
                      <div className="size-1.5 rounded-full mt-2 group-hover/item:scale-125 transition-transform shrink-0" style={{ backgroundColor: `var(--theme-primary)` }} />
                      <EditableText className={`${getResponsiveFontSize(item, 'text-sm sm:text-base', 120)} text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed`} multiline value={item} onChange={(val: any) => { const arr = [...current.content]; arr[i] = val; onUpdateSlide(currentSlide, 'content', arr) }} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EditableText className={`${getResponsiveFontSize(current?.content, 'text-sm sm:text-base', 240)} text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium whitespace-pre-wrap`} multiline value={current?.content} onChange={(val: any) => onUpdateSlide(currentSlide, 'content', val)} />
              )}
            </div>
          </div>
       )}

         <div className="absolute bottom-6 right-10 text-[10px] text-zinc-300 dark:text-zinc-600 font-black italic uppercase">
           Generated by OpenOrange
         </div>

         {/* Dynamic Multi-Block Rendering for "Model Defined" Frameworks */}
         {current?.blocks && current.blocks.map((block: PptBlock, i: number) => {
           const style: React.CSSProperties = {
             position: 'absolute',
             left: `${block.x}px`,
             top: `${block.y}px`,
             width: `${block.w}px`,
             height: `${block.h}px`,
             fontSize: block.fontSize ? `${block.fontSize}px` : undefined,
             fontWeight: block.fontWeight,
             color: block.color || 'inherit',
             textAlign: block.align || 'left',
             opacity: block.opacity,
             borderRadius: block.borderRadius ? `${block.borderRadius}px` : undefined,
             backgroundColor: block.fill,
             border: block.stroke ? `1px solid ${block.stroke}` : undefined,
             zIndex: block.zIndex || 10,
             display: 'flex',
             flexDirection: 'column',
             justifyContent: block.valign === 'middle' ? 'center' : block.valign === 'bottom' ? 'flex-end' : 'flex-start',
             overflow: 'hidden'
           }

           if (block.type === 'text') {
             return <div key={i} style={style} className="leading-relaxed whitespace-pre-wrap">{block.content}</div>
           }
           if (block.type === 'list' && Array.isArray(block.content)) {
             return (
               <ul key={i} style={style} className="list-disc list-inside space-y-2">
                 {block.content.map((item, j) => <li key={j}>{item}</li>)}
               </ul>
             )
           }
           if (block.type === 'image' && (block.imageUrl || current.imageUrl)) {
             return (
               <div key={i} style={style}>
                 <img 
                   src={`/api/proxy-image?url=${encodeURIComponent(block.imageUrl || current.imageUrl || '')}`} 
                   className="w-full h-full object-cover" 
                   alt="Slide Element" 
                 />
               </div>
             )
           }
           if (block.type === 'shape') {
             return <div key={i} style={style} />
           }
           return null
         })}
      </div>
  )
}

class PptErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: any, errorInfo: any) { console.error("PPT Error:", error, errorInfo) }
  render() {
    if (this.state.hasError) return <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">Failed to render slide.</div>
    return this.props.children
  }
}

export function PptRenderer({ data, isStreaming: _isStreaming, onTriggerAiCommand }: { data: PptData | string; isStreaming?: boolean; onTriggerAiCommand?: (payload: { text: string; command: string; slideIndex: number }) => void }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 })
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      if (entries[0]) {
        const newW = Math.max(1, entries[0].contentRect.width - (window.innerWidth < 640 ? 16 : 48))
        const newH = Math.max(1, entries[0].contentRect.height - (window.innerWidth < 640 ? 16 : 48))
        
        requestAnimationFrame(() => {
          setContainerSize(prev => {
            if (Math.abs(prev.w - newW) < 1 && Math.abs(prev.h - newH) < 1) return prev
            return { w: newW, h: newH }
          })
        })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Progressive rendering cache
  const [pptData, setPptData] = useState<PptData | null>(null)
  
  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [localTitle, setLocalTitle] = useState("")

  useEffect(() => {
    if (pptData?.slides?.[currentSlide]) {
      setLocalTitle(pptData.slides[currentSlide].title || "")
    }
  }, [currentSlide, pptData])

  const handleUpdateCurrentSlide = (field: string, value: any) => {
    setPptData(prev => {
      if (!prev) return prev
      const newSlides = [...prev.slides]
      newSlides[currentSlide] = { ...newSlides[currentSlide], [field]: value }
      return { ...prev, slides: newSlides }
    })
  }

  const handleUpdateGlobal = (field: string, value: any) => {
    setPptData(prev => {
      if (!prev) return prev
      return { ...prev, [field]: value }
    })
  }

  useEffect(() => {
    if (!data) return
    if (typeof data !== "string") {
      setPptData(data)
      return
    }

    try {
      const parsed = parsePartial(data)
      if (parsed && typeof parsed === "object" && parsed.title && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        setPptData(parsed)
      }
    } catch (e) {
      console.warn("[PptRenderer] parsePartial recovery failed (safe ignore during streaming):", e)
    }
  }, [data])

  // Diagnostic logging - only log when data changes significantly or parse fails at stable state
  useEffect(() => {
    if (typeof data === "string" && data.length > 0) {
      if (!pptData) {
        // Only warn occasionally or if length is large
        if (data.length % 100 === 0) {
           console.log("[PptRenderer] Parsing partial stream...", data.length)
        }
      }
    }
  }, [data, !!pptData])

  const slides = pptData?.slides || []
  const current = slides[currentSlide]
  const layout = current?.layout || (current?.leftContent ? "two_column" : "bullet")

  const [showControls, setShowControls] = useState(true)
  const mouseTimerRef = useRef<any>(null)

  // 全屏键盘快捷键翻页与退出
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setCurrentSlide(prev => Math.max(0, prev - 1))
      } else if (e.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, slides.length])

  // 全屏鼠标移动淡入与静止 2.5s 淡出
  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
      return
    }

    const handleMouseMove = () => {
      setShowControls(true)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
      
      mouseTimerRef.current = setTimeout(() => {
        setShowControls(false)
      }, 2500)
    }

    window.addEventListener('mousemove', handleMouseMove)
    handleMouseMove()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
    }
  }, [isFullscreen])

  if (!pptData) {
    return (
      <div className="my-4 p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50 animate-pulse">
        <div className="p-4 bg-orange-500/10 rounded-full">
           <Presentation className="size-8 text-orange-600 animate-bounce" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">正在生成幻灯片...</p>
          <p className="text-[11px] text-zinc-500">正在解析 AI 输出的 PPT 结构</p>
        </div>
        <Loader2 className="size-4 animate-spin text-zinc-400 mt-2" />
      </div>
    )
  }

  const theme = THEMES[pptData.theme || "zinc"] || THEMES.zinc

  const downloadPpt = async () => {
    setIsDownloading(true)
    try {
      const pres = new PptxGenJS()
      
      pres.layout = "LAYOUT_16x9"
      pres.title = pptData.title
      pres.author = pptData.author || "OpenOrangeAI"
      pres.company = pptData.company || "OpenOrange"

      for (const slide of pptData.slides) {
        const s = pres.addSlide()
        const layout = slide.layout || (slide.leftContent ? "two_column" : "bullet")
        const cStyle = pptData.style || "modern"

        let tFont = "Arial", sFont = "Arial"
        let pColor = theme.primary, sColor = theme.secondary
        let styleBg = "FFFFFF"
        
        if (cStyle === "apple") {
          styleBg = "000000"
          tFont = "Arial"
          sFont = "Arial"
          pColor = "FFFFFF"
          sColor = "A1A1AA"
        } else if (cStyle === "swiss") {
          styleBg = "F8F9FA"
          tFont = "Arial Black"
          sFont = "Arial"
          pColor = theme.primary
          sColor = "4A4A4A"
        } else if (cStyle === "editorial") {
          styleBg = "F5F5DC"
          tFont = "Georgia"
          sFont = "Georgia"
          pColor = "1A1A1A"
          sColor = "666666"
        }

        // Apply Background
        const finalBg = (slide.background || pptData.background || styleBg).replace('#', '')
        s.background = { color: finalBg }

        if (slide.backgroundUrl) {
          try {
            const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(slide.backgroundUrl)}`)
            const blob = await res.blob()
            const b64 = await new Promise<string>((resolve) => {
              const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob)
            })
            s.background = { data: b64 }
          } catch(e) { console.warn("Failed slide bg img", e) }
        }
        
        let base64Img = ""
        if (slide.imageUrl) {
          try {
            const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(slide.imageUrl)}`)
            const blob = await res.blob()
            base64Img = await new Promise<string>((resolve) => {
              const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob)
            })
          } catch(e) { console.warn("Img fetch fail", e) }
        }

        const MARGIN_X = 0.5
        const FONT_SCALE = 0.85 // Map 1280px pixel size to PPT points approx.
        
        if (slide.blocks && Array.isArray(slide.blocks) && slide.blocks.length > 0) {
          for (const block of slide.blocks) {
            const xPct = (block.x / 1280) * 100
            const yPct = (block.y / 720) * 100
            const wPct = (block.w / 1280) * 100
            const hPct = (block.h / 720) * 100

            if (block.type === 'text' || block.type === 'list') {
              const textOptions: any = {
                x: `${xPct}%`, y: `${yPct}%`, w: `${wPct}%`, h: `${hPct}%`,
                fontSize: block.fontSize ? block.fontSize * FONT_SCALE : 18,
                color: (block.color || pColor).replace('#', ''),
                align: block.align || 'left',
                valign: block.valign || 'top',
                fontFace: tFont,
                bold: block.fontWeight === 'bold' || (typeof block.fontWeight === 'number' && block.fontWeight >= 700)
              }
              if (block.type === 'list' && Array.isArray(block.content)) {
                s.addText(block.content.map(t => ({ text: t, options: { bullet: true, margin: [0, 0, 0, 5] } })), textOptions)
              } else {
                s.addText(String(block.content || ""), textOptions)
              }
            } else if (block.type === 'image') {
              const imgUrl = block.imageUrl || slide.imageUrl
              if (imgUrl) {
                try {
                  const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(imgUrl)}`)
                  const blob = await res.blob()
                  const b64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob)
                  })
                  s.addImage({ data: b64, x: `${xPct}%`, y: `${yPct}%`, w: `${wPct}%`, h: `${hPct}%`, sizing: { type: 'cover', w: (block.w/1280)*10, h: (block.h/720)*5.625 } })
                } catch(e) { console.warn("Block img fail", e) }
              }
            } else if (block.type === 'shape') {
              s.addShape(pres.ShapeType.rect, {
                x: `${xPct}%`, y: `${yPct}%`, w: `${wPct}%`, h: `${hPct}%`,
                fill: { color: (block.fill || pColor).replace('#', ''), alpha: block.opacity ? (1 - block.opacity)*100 : 0 }
              })
            }
          }
        } else {
          if (layout === "title") {
          s.addText(slide.title, { x: 1, y: 2, w: 8, h: 1.5, fontSize: 44, bold: true, color: pColor, align: "center", fontFace: tFont })
          if (slide.subtitle) {
            s.addText(slide.subtitle, { x: 1, y: 3.5, w: 8, h: 1, fontSize: 24, color: sColor, align: "center", italic: true, fontFace: sFont })
          }
        } 
        else if (layout === "hero") {
          s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 3.5, h: "100%", fill: { color: pColor } })
          s.addText(slide.title, { x: 0.5, y: 2, w: 2.5, h: 3, fontSize: 36, bold: true, color: "FFFFFF", fontFace: tFont })
          
          if (Array.isArray(slide.content)) {
            s.addText(
              slide.content.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 10] } })),
              { x: 4, y: 1.5, w: 5.5, h: 4, fontSize: 20, color: sColor, fontFace: sFont }
            )
          } else if (slide.content) {
            s.addText(slide.content, { x: 4, y: 1.5, w: 5.5, h: 4, fontSize: 20, color: sColor, fontFace: sFont })
          }
        }
        else if (layout === "image_left" || layout === "image_right") {
          s.addText(slide.title, { x: MARGIN_X, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: pColor, fontFace: tFont })
          
          const imgX = layout === "image_left" ? 0.5 : 5
          const textX = layout === "image_left" ? 5 : 0.5
          
          if (slide.imageUrl) {
            s.addImage({ path: slide.imageUrl, x: imgX, y: 1.5, w: 4.5, h: 3.5, sizing: { type: "cover", w: 4.5, h: 3.5 } })
          } else {
            s.addShape(pres.ShapeType.rect, { x: imgX, y: 1.5, w: 4.5, h: 3.5, fill: { color: "EFEFEF" } })
            s.addText("Image Placeholder", { x: imgX, y: 1.5, w: 4.5, h: 3.5, align: "center", color: "999999" })
          }

          if (Array.isArray(slide.content)) {
            s.addText(
              slide.content.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 10] } })),
              { x: textX, y: 1.5, w: 4.5, h: 3.5, fontSize: 18, color: sColor, fontFace: sFont }
            )
          } else if (slide.content) {
            s.addText(slide.content, { x: textX, y: 1.5, w: 4.5, h: 3.5, fontSize: 18, color: sColor, fontFace: sFont })
          }
        }
        else if (layout === "two_column") {
          s.addText(slide.title, { x: MARGIN_X, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: pColor, fontFace: tFont })
          
          const leftContent = slide.leftContent || slide.content
          if (Array.isArray(leftContent)) {
            s.addText(
              leftContent.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 10] } })),
              { x: 0.5, y: 1.5, w: 4.2, h: 3.5, fontSize: 16, color: sColor, fontFace: sFont }
            )
          } else if (leftContent) {
            s.addText(String(leftContent), { x: 0.5, y: 1.5, w: 4.2, h: 3.5, fontSize: 16, color: sColor, fontFace: sFont })
          }

          if (Array.isArray(slide.rightContent)) {
            s.addText(
              slide.rightContent.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 10] } })),
              { x: 5.3, y: 1.5, w: 4.2, h: 3.5, fontSize: 16, color: sColor, fontFace: sFont }
            )
          } else if (slide.rightContent) {
            s.addText(slide.rightContent, { x: 5.3, y: 1.5, w: 4.2, h: 3.5, fontSize: 16, color: sColor, fontFace: sFont })
          }
        }
        else if (layout === "section") {
          s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: pColor } })
          s.addText(slide.subtitle || "Section", { x: 1, y: 2, w: 8, h: 0.5, fontSize: 18, bold: true, color: theme.accent, align: "center", fontFace: sFont })
          s.addText(slide.title, { x: 1, y: 2.8, w: 8, h: 1.5, fontSize: 48, bold: true, color: "FFFFFF", align: "center", fontFace: tFont })
        }
        else if (layout === "quote") {
          s.addText("\"", { x: 0.5, y: 0.5, w: 1, h: 1, fontSize: 100, color: "E0E0E0", fontFace: "Georgia" })
          s.addText(slide.title, { x: 1.5, y: 1.5, w: "70%", h: 2, fontSize: 32, italic: true, color: sColor, fontFace: sFont })
          s.addText(`— ${slide.subtitle || ""}`, { x: 1.5, y: 3.5, w: "70%", h: 1, fontSize: 20, bold: true, color: pColor, fontFace: sFont })
        }
        else if (layout === "kpi") {
          s.addText(slide.title, { x: 1, y: 1, w: "80%", h: 2, fontSize: 90, bold: true, color: pColor, align: "center", fontFace: tFont })
          s.addText(slide.subtitle || "", { x: 1, y: 3, w: "80%", h: 1, fontSize: 28, bold: true, color: sColor, align: "center", fontFace: sFont })
          s.addText(Array.isArray(slide.content) ? slide.content.join(", ") : (slide.content||""), { x: 1, y: 4, w: "80%", h: 1, fontSize: 18, color: sColor, align: "center", fontFace: sFont })
        }
        else if (layout === "three_column") {
          s.addText(slide.title, { x: MARGIN_X, y: 0.3, w: "90%", h: 0.8, fontSize: 32, bold: true, color: pColor, fontFace: tFont })
          const cols = Array.isArray(slide.content) ? slide.content.slice(0,3) : [String(slide.content)]
          cols.forEach((col, i) => {
            s.addShape(pres.ShapeType.rect, { x: 0.5 + (i * 3.1), y: 1.5, w: 2.8, h: 3, fill: { color: cStyle === "apple" ? "1A1A1A" : "F8F9FA" } })
            s.addText(`0${i+1}`, { x: 0.6 + (i * 3.1), y: 1.6, w: 0.8, h: 0.5, fontSize: 24, bold: true, color: pColor, fontFace: sFont })
            s.addText(col, { x: 0.6 + (i * 3.1), y: 2.2, w: 2.6, h: 2, fontSize: 16, color: sColor, fontFace: sFont })
          })
        }
        else {
          s.addText(slide.title, { 
            x: MARGIN_X, y: 0.3, w: "90%", h: 0.8, 
            fontSize: 32, bold: true, color: pColor, fontFace: tFont
          })
          s.addShape(pres.ShapeType.rect, { x: MARGIN_X, y: 1.1, w: 0.5, h: 0.04, fill: { color: pColor } })
          
          if (Array.isArray(slide.content)) {
            s.addText(
              slide.content.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 12] } })),
              { x: 0.8, y: 1.6, w: "85%", h: 3.8, fontSize: 18, color: sColor, fontFace: sFont }
            )
          } else if (slide.content) {
            s.addText(slide.content, { 
              x: 0.8, y: 1.6, w: "85%", h: 3.8, fontSize: 18, color: sColor, fontFace: sFont
            })
          }
        }
      }

      if (slide.notes) s.addNotes(slide.notes)
    }

      await pres.writeFile({ fileName: `${pptData.title.replace(/\s+/g, '_')}.pptx` })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className={`overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-2xl bg-background flex flex-col transition-all ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none border-0' : 'my-4 relative rounded-2xl border'}`}>
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between px-5 py-4 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg text-theme-primary">
              <Presentation className="size-5" style={{ color: `#${theme.primary}` }} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm truncate max-w-[200px] leading-tight">{pptData.title}</span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mt-0.5">
                 <Palette className="size-2.5" />
                 {pptData.theme || "Zinc"} · {pptData.style || "Modern"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full p-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-white dark:hover:bg-zinc-700 transition-all" onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))} disabled={currentSlide === 0}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-[11px] font-bold tabular-nums px-3 min-w-[50px] text-center">
                {currentSlide + 1} / {slides.length}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-white dark:hover:bg-zinc-700 transition-all" onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))} disabled={currentSlide === slides.length - 1}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-0.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-white dark:hover:bg-zinc-700 transition-all" onClick={() => setZoomLevel(z => Math.max(z - 0.25, 0.5))}>
                <ZoomOut className="size-3.5 text-zinc-500" />
              </Button>
              <span className="text-[10px] font-bold tabular-nums w-9 text-center text-zinc-600 dark:text-zinc-400">{Math.round(zoomLevel * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-white dark:hover:bg-zinc-700 transition-all" onClick={() => setZoomLevel(z => Math.min(z + 0.25, 2))}>
                <ZoomIn className="size-3.5 text-zinc-500" />
              </Button>
              <div className="w-[1px] h-3 bg-zinc-200 dark:bg-zinc-700 mx-1" />
              <Button variant="ghost" size="icon" className={`h-7 w-7 rounded-md transition-all ${isEditorOpen ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' : 'hover:bg-white dark:hover:bg-zinc-700'}`} onClick={() => setIsEditorOpen(!isEditorOpen)}>
                <Palette className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-white dark:hover:bg-zinc-700 transition-all" onClick={() => {
                setIsFullscreen(!isFullscreen)
                setZoomLevel(1)
              }}>
                {isFullscreen ? <Minimize className="size-3.5 text-zinc-500" /> : <Maximize className="size-3.5 text-zinc-500" />}
              </Button>
            </div>
            <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <Button onClick={downloadPpt} disabled={isDownloading} size="sm" className="h-8 px-4 gap-2 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity font-bold rounded-full shadow-lg shrink-0">
              {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {isDownloading ? "..." : "Download"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Slide Preview Area */}
        <div 
          ref={containerRef}
          className={`bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center relative overflow-hidden group/canvas flex-1 ${!isFullscreen && !isEditorOpen ? 'aspect-video' : ''}`}
        >
          <div className="absolute inset-0 overflow-auto flex items-center justify-center custom-scrollbar">
            <div 
              className="relative transition-all duration-200 flex items-center justify-center"
              style={{ 
                width: 1280 * Math.min(containerSize.w / 1280, containerSize.h / 720) * zoomLevel, 
                height: 720 * Math.min(containerSize.w / 1280, containerSize.h / 720) * zoomLevel 
              }}
            >
              <div 
                className="absolute shadow-[0_0_30px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out"
                style={{ 
                  width: '1280px', 
                  height: '720px', 
                  transform: `scale(${Math.min(containerSize.w / 1280, containerSize.h / 720) * zoomLevel})`, 
                  transformOrigin: 'center center' 
                }}
              >
                <PptErrorBoundary>
                  <SlideView 
                    slide={current} 
                    layout={layout} 
                    theme={theme} 
                    currentSlide={currentSlide} 
                    pptData={pptData} 
                    onUpdateSlide={(sIdx: number, field: string, val: any) => handleUpdateCurrentSlide(field, val)}
                    onTriggerAiCommand={onTriggerAiCommand}
                  />
                </PptErrorBoundary>
              </div>
            </div>
          </div>

          {/* Floating Canvas Toolbar */}
          {!isEditorOpen && !isFullscreen && (
            <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 opacity-0 group-hover/canvas:opacity-100 transition-opacity animate-in fade-in duration-200">
              <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-2.5 flex flex-col gap-2.5 w-[140px]">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">Theme</span>
                  <div className="grid grid-cols-5 gap-1.5 px-1">
                    {Object.keys(THEMES).map(tName => (
                      <button 
                        key={tName}
                        onClick={() => handleUpdateGlobal('theme', tName)}
                        className={`size-4 rounded-full border transition-all ${pptData.theme === tName ? 'border-zinc-900 dark:border-white scale-110 shadow-sm' : 'border-transparent hover:scale-110'}`}
                        style={{ backgroundColor: `#${THEMES[tName as keyof typeof THEMES].primary}` }}
                        title={tName}
                      />
                    ))}
                  </div>
                </div>
                <div className="w-full h-px bg-zinc-200/50 dark:bg-zinc-800/50" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">Style</span>
                  <select 
                    className="w-full text-[11px] bg-zinc-100/50 dark:bg-zinc-800/50 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md px-2 py-1 outline-none font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                    value={pptData.style || 'modern'}
                    onChange={e => handleUpdateGlobal('style', e.target.value)}
                  >
                    <option value="modern">Modern</option>
                    <option value="swiss">Swiss</option>
                    <option value="apple">Apple</option>
                    <option value="editorial">Editorial</option>
                    <option value="brutalism">Brutalism</option>
                  </select>
                </div>
                <div className="w-full h-px bg-zinc-200/50 dark:bg-zinc-800/50" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">Layout</span>
                  <select 
                    className="w-full text-[11px] bg-zinc-100/50 dark:bg-zinc-800/50 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md px-2 py-1 outline-none font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                    value={current?.layout || 'bullet'}
                    onChange={e => handleUpdateCurrentSlide('layout', e.target.value)}
                  >
                    <option value="title">Title</option>
                    <option value="hero">Hero</option>
                    <option value="image_left">Image Left</option>
                    <option value="image_right">Image Right</option>
                    <option value="two_column">Two Column</option>
                    <option value="three_column">Three Column</option>
                    <option value="kpi">KPI</option>
                    <option value="quote">Quote</option>
                    <option value="section">Section</option>
                    <option value="bullet">Bullet</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen Cinema-like Floating Glass Panel */}
          {isFullscreen && (
            <div 
              className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 bg-zinc-950/85 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/80 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 ease-in-out ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 disabled:opacity-30 transition-all" 
                  onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))} 
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs font-bold font-mono text-zinc-300 min-w-[60px] text-center">
                  {currentSlide + 1} / {slides.length}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 disabled:opacity-30 transition-all" 
                  onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))} 
                  disabled={currentSlide === slides.length - 1}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="w-px h-5 bg-zinc-800/80" />
              <div className="flex items-center gap-1.5">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all" 
                  onClick={() => { setIsFullscreen(false); setZoomLevel(1) }}
                  title="退出全屏 (Esc)"
                >
                  <Minimize className="size-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all" 
                  onClick={downloadPpt} 
                  disabled={isDownloading}
                  title="下载 PPTX"
                >
                  {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Editor Sidebar */}
        {isEditorOpen && (
          <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-y-auto flex flex-col custom-scrollbar shrink-0">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-bold text-sm mb-4">全局设置</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-2 block">主题色 (Theme)</label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.keys(THEMES).map(tName => (
                      <button 
                        key={tName}
                        onClick={() => handleUpdateGlobal('theme', tName)}
                        className={`size-8 rounded-full border-2 flex items-center justify-center ${pptData.theme === tName ? 'border-zinc-900 dark:border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: `#${THEMES[tName as keyof typeof THEMES].primary}` }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-2 block">版式风格 (Style)</label>
                  <select 
                    className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none"
                    value={pptData.style || 'modern'}
                    onChange={e => handleUpdateGlobal('style', e.target.value)}
                  >
                    <option value="modern">Modern (现代)</option>
                    <option value="swiss">Swiss (瑞士网格)</option>
                    <option value="apple">Apple (极简暗黑)</option>
                    <option value="editorial">Editorial (杂志风)</option>
                    <option value="brutalism">Brutalism (粗野主义)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 flex-1">
              <h3 className="font-bold text-sm mb-4">当前页内容</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">布局类型 (Layout)</label>
                  <select 
                    className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none"
                    value={current?.layout || 'bullet'}
                    onChange={e => handleUpdateCurrentSlide('layout', e.target.value)}
                  >
                    <option value="title">Title (封面)</option>
                    <option value="hero">Hero (图文头图)</option>
                    <option value="image_left">Image Left (左图右文)</option>
                    <option value="image_right">Image Right (左文右图)</option>
                    <option value="two_column">Two Column (双栏对比)</option>
                    <option value="three_column">Three Column (三栏并列)</option>
                    <option value="kpi">KPI (核心指标)</option>
                    <option value="quote">Quote (名言引用)</option>
                    <option value="section">Section (过渡页)</option>
                    <option value="bullet">Bullet (列表要点)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">主标题 (Title)</label>
                  <input 
                    className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:border-orange-500"
                    value={localTitle}
                    onChange={e => setLocalTitle(e.target.value)}
                    onBlur={() => handleUpdateCurrentSlide('title', localTitle)}
                  />
                </div>
                {['title', 'quote', 'kpi', 'section'].includes(current?.layout || '') && (
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">副标题 (Subtitle)</label>
                    <input 
                      className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:border-orange-500"
                      value={current?.subtitle || ''}
                      onChange={e => handleUpdateCurrentSlide('subtitle', e.target.value)}
                    />
                  </div>
                )}
                {!['title'].includes(current?.layout || '') && (
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">正文内容 (Content/Bullets)</label>
                    <textarea 
                      className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:border-orange-500 min-h-[100px] resize-y"
                      value={Array.isArray(current?.content) ? current.content.join('\n') : (current?.content || '')}
                      onChange={e => {
                        if (Array.isArray(current?.content)) {
                           handleUpdateCurrentSlide('content', e.target.value.split('\n'))
                        } else {
                           handleUpdateCurrentSlide('content', e.target.value)
                        }
                      }}
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">如为多列或列表，请用回车换行分隔</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div className="px-5 py-3 flex gap-3 overflow-x-auto bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 scrollbar-hide">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`flex-shrink-0 size-10 rounded-lg border-2 transition-all flex items-center justify-center font-black text-xs ${
                currentSlide === i 
                  ? "border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-800 shadow-md scale-105" 
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:scale-105"
              }`}
              style={currentSlide === i ? { color: `#${theme.primary}` } : {}}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }

        /* Modern Style (Default) */
        .style-modern {
          background-color: var(--background, #ffffff);
          border-top: 4px solid var(--theme-primary);
          border-radius: 4px;
          padding: 2.5rem;
        }
        .dark .style-modern {
          background-color: #18181b;
        }

        /* Pencil / Hand-drawn Style */
        .style-pencil {
          font-family: 'Comic Sans MS', 'Chalkboard SE', 'Caveat', cursive, sans-serif;
          background-color: #fffdf5;
          border: 3px solid var(--theme-primary);
          border-radius: 8px 12px 6px 10px;
          padding: 2.5rem;
          box-shadow: 6px 8px 0px rgba(0,0,0,0.1);
          transform: rotate(-0.5deg);
        }
        .dark .style-pencil {
          background-color: #1e1e1e;
          border-color: var(--theme-secondary);
        }
        .style-pencil h2 {
          border-bottom: 2px dashed var(--theme-primary);
          padding-bottom: 8px;
          display: inline-block;
        }

        /* Brutalism Style */
        .style-brutalism {
          font-family: 'Courier New', Courier, monospace;
          background-color: var(--theme-accent);
          border: 6px solid #000;
          border-radius: 0;
          padding: 2.5rem;
          box-shadow: 12px 12px 0px #000;
        }
        .dark .style-brutalism {
          border-color: #fff;
          box-shadow: 12px 12px 0px #fff;
        }
        .style-brutalism h2 {
          font-weight: 900;
          text-transform: uppercase;
          background-color: var(--theme-primary);
          color: #fff;
          padding: 8px 16px;
          display: inline-block;
          border: 4px solid #000;
        }
        .dark .style-brutalism h2 {
          border-color: #fff;
        }

        /* Gradient / Glassmorphism Style */
        .style-gradient {
          background: linear-gradient(135deg, var(--theme-accent) 0%, rgba(255,255,255,0.8) 100%);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 20px;
          padding: 2.5rem;
          box-shadow: 0 30px 60px rgba(0,0,0,0.1);
        }
        .dark .style-gradient {
          background: linear-gradient(135deg, #18181b 0%, var(--theme-accent) 100%);
          border-color: rgba(255,255,255,0.1);
        }

        /* 5. Cyberpunk Style */
        .style-cyberpunk {
          font-family: 'Courier New', monospace;
          background-color: #050510;
          color: #0ff;
          border: 2px solid #f0f;
          border-radius: 4px;
          padding: 2.5rem;
          box-shadow: 0 0 10px #f0f, inset 0 0 10px #f0f;
          background-image: linear-gradient(rgba(0, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        .dark .style-cyberpunk { background-color: #020208; }
        .style-cyberpunk h2 { color: #f0f; text-shadow: 2px 2px #0ff; text-transform: uppercase; }

        /* 6. Notion / Minimal Style */
        .style-notion {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          background-color: #ffffff;
          color: #37352f;
          border-radius: 6px;
          padding: 2.5rem;
          box-shadow: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px;
        }
        .dark .style-notion { background-color: #191919; color: #d4d4d4; }
        .style-notion h2 { border-bottom: 2px solid rgba(55,53,47,0.09); padding-bottom: 4px; }

        /* 7. Retro / Vaporwave Style */
        .style-retro {
          font-family: 'Arial', sans-serif;
          background: linear-gradient(180deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
          border: 4px solid #8fd3f4;
          border-radius: 12px;
          padding: 2.5rem;
          box-shadow: 8px 8px 0 rgba(143, 211, 244, 0.5);
        }
        .dark .style-retro { background: linear-gradient(180deg, #2b1055 0%, #7597de 100%); border-color:#ff71ce; }

        /* 8. Bauhaus Style */
        .style-bauhaus {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          background-color: #f4f4f4;
          border-left: 16px solid #e2001a;
          border-top: 16px solid #005f86;
          border-bottom: 16px solid #ffcc00;
          border-right: 4px solid #1a1a1a;
          padding: 2.5rem;
          border-radius: 0;
        }
        .dark .style-bauhaus { background-color: #222; }

        /* 9. Swiss Minimal */
        .style-swiss {
          font-family: 'Arial Black', Arial, sans-serif;
          background-color: #F8F9FA;
        }
        .dark .style-swiss { background-color: #0A0A0A; }
        .style-swiss h2 { font-weight: 900; letter-spacing: -2px; text-transform: uppercase; }

        /* 10. Apple Glass Hero */
        .style-apple {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #000000;
        }
        .style-apple h2 { font-weight: 700; letter-spacing: -1.5px; }

        /* 11. Editorial / Vogue */
        .style-editorial {
          font-family: 'Georgia', 'Playfair Display', serif;
          background-color: #F5F5DC;
        }
        .dark .style-editorial { background-color: #1A1A1A; }
        .style-editorial h2 { font-weight: 400; line-height: 1.1; }

        /* 12. Terminal / Hacker Style */
        .style-terminal {
          font-family: 'Consolas', 'Monaco', monospace;
          background-color: #000000;
          color: #00ff00;
          border: 1px solid #00ff00;
          border-radius: 2px;
          padding: 2.5rem;
          box-shadow: inset 0 0 18px rgba(0,255,0,0.2);
        }
        .dark .style-terminal { background-color: #000; }
        .style-terminal h2 { color: #00ff00; border-bottom: 1px dashed #00ff00; display: inline-block; padding-bottom: 4px; }

        /* 10. Academic / LaTeX Style */
        .style-academic {
          font-family: 'Times New Roman', Times, serif;
          background-color: #ffffff;
          color: #000000;
          border: 1px solid #d3d3d3;
          border-radius: 2px;
          padding: 3rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          line-height: 1.6;
        }
        .dark .style-academic { background-color: #fcfcfc; }
        .style-academic h2 { text-align: center; border-bottom: 1px solid #000; padding-bottom: 12px; margin-bottom: 24px; font-variant: small-caps; }

      `}</style>
    </div>
  )
}
