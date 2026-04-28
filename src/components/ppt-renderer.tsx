"use client"

import React, { useState, useEffect } from "react"
import PptxGenJS from "pptxgenjs"
import { Download, Presentation, Layout as LayoutIcon, FileText, ChevronLeft, ChevronRight, Palette, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PptSlide {
  title: string
  subtitle?: string
  content?: string[] | string
  leftContent?: string[] | string
  rightContent?: string[] | string
  layout?: "title" | "bullet" | "two_column" | "hero" | "image" | "section" | "quote" | "kpi" | "three_column"
  imageUrl?: string
  notes?: string
}

interface PptData {
  title: string
  author?: string
  company?: string
  theme?: "zinc" | "orange" | "blue" | "green" | "rose"
  style?: "modern" | "pencil" | "gradient" | "brutalism"
  slides: PptSlide[]
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
    // Try to close open braces for a lucky parse
    try {
      let temp = str.trim()
      if (!temp.endsWith("}")) {
        // Very basic attempt: find last complete slide if possible
        // For now, just return null if not valid JSON
        return null
      }
      return JSON.parse(temp)
    } catch {
      return null
    }
  }
}

const SlideView = ({ slide, layout, theme, currentSlide, pptData }: any) => {
  const current = slide;
  return (
    <div 
      className={`w-full h-full shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col relative transition-all duration-500 ease-out style-${pptData.style || "modern"}`}
      style={{ 
        "--theme-primary": `#${theme.primary}`,
        "--theme-secondary": `#${theme.secondary}`,
        "--theme-accent": `#${theme.accent}`
      } as React.CSSProperties}
    >
       {layout === "title" ? (
         <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
           <h2 className="text-3xl sm:text-4xl font-black mb-6 leading-tight tracking-tight" style={{ color: `var(--theme-primary)` }}>{current?.title}</h2>
           {current?.subtitle && <p className="text-lg sm:text-xl text-zinc-500 font-medium italic">{current.subtitle}</p>}
           <div className="w-16 h-1 mt-8 rounded-full" style={{ backgroundColor: `var(--theme-primary)` }} />
         </div>
       ) : layout === "hero" ? (
         <div className="h-full flex gap-10 animate-in fade-in duration-500">
           <div className="w-1/3 p-6 flex items-center rounded-xl" style={{ backgroundColor: `var(--theme-primary)` }}>
             <h2 className="text-2xl font-black text-white leading-tight">{current?.title}</h2>
           </div>
           <div className="flex-1 flex items-center">
             <div className="space-y-4">
                {Array.isArray(current?.content) || typeof current?.content === 'string' ? (
                  <div>
                    {Array.isArray(current.content) ? (
                      <ul className="list-disc list-inside space-y-3 text-zinc-600 dark:text-zinc-300">
                        {current.content.map((item:any, i:any) => <li key={i} className="text-sm sm:text-base font-medium">{item}</li>)}
                      </ul>
                    ) : (
                      <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium">{current?.content}</p>
                    )}
                  </div>
                ) : null}
             </div>
           </div>
         </div>
       ) : layout === "two_column" ? (
         <div className="h-full flex flex-col animate-in fade-in duration-500">
           <h2 className="text-2xl font-black mb-8 border-l-4 pl-4" style={{ borderColor: `var(--theme-primary)` }}>{current?.title}</h2>
           <div className="flex-1 grid grid-cols-2 gap-10">
             <div className="space-y-3">
                {Array.isArray(current?.leftContent || current?.content) ? (
                  <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300">
                    {((current?.leftContent || current?.content) as any[]).map((v, i) => <li key={i} className="text-xs sm:text-sm font-medium">{v}</li>)}
                  </ul>
                ) : <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 font-medium">{String(current?.leftContent || current?.content || "")}</p>}
             </div>
             <div className="space-y-3">
                {Array.isArray(current?.rightContent) ? (
                  <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300">
                    {current.rightContent.map((v:any, i:any) => <li key={i} className="text-xs sm:text-sm font-medium">{v}</li>)}
                  </ul>
                ) : <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 font-medium">{current?.rightContent}</p>}
             </div>
           </div>
         </div>
       ) : layout === "section" ? (
         <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
           <div className="px-6 py-2 rounded-full mb-6 font-bold tracking-widest uppercase text-sm" style={{ backgroundColor: `var(--theme-accent)`, color: `var(--theme-primary)` }}>{current?.subtitle || "Next"}</div>
           <h2 className="text-4xl sm:text-5xl font-black mb-6 leading-tight tracking-tight" style={{ color: `var(--theme-primary)` }}>{current?.title}</h2>
           {current?.content && <p className="text-xl text-zinc-500 font-medium max-w-2xl">{current.content}</p>}
         </div>
       ) : layout === "quote" ? (
         <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-500 max-w-4xl mx-auto">
           <span className="text-8xl font-serif text-zinc-200 dark:text-zinc-800 absolute top-10 left-10 opacity-50">"</span>
           <h2 className="text-3xl sm:text-4xl font-bold mb-8 leading-relaxed italic text-zinc-700 dark:text-zinc-300 relative z-10">{current?.title}</h2>
           {current?.subtitle && <p className="text-xl font-black uppercase tracking-widest" style={{ color: `var(--theme-primary)` }}>— {current.subtitle}</p>}
           {current?.content && <p className="text-sm text-zinc-400 mt-2 font-medium">{current.content}</p>}
         </div>
       ) : layout === "kpi" ? (
         <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
           <h1 className="text-8xl sm:text-[120px] font-black tracking-tighter mb-4" style={{ color: `var(--theme-primary)` }}>{current?.title}</h1>
           {current?.subtitle && <h3 className="text-2xl sm:text-3xl font-bold text-zinc-800 dark:text-zinc-200 mb-6">{current.subtitle}</h3>}
           {current?.content && <p className="text-lg text-zinc-500 font-medium max-w-2xl">{current.content}</p>}
         </div>
       ) : layout === "three_column" ? (
         <div className="h-full flex flex-col animate-in fade-in duration-500">
           <h2 className="text-2xl font-black mb-10 tracking-tight" style={{ color: `var(--theme-primary)` }}>{current?.title}</h2>
           <div className="flex-1 grid grid-cols-3 gap-8">
             {(Array.isArray(current?.content) ? current.content.slice(0,3) : [String(current?.content)]).map((item, i) => (
               <div key={i} className="flex flex-col gap-4 p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 relative overflow-hidden group/card shadow-sm hover:shadow-lg transition-all">
                 <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: `var(--theme-primary)` }} />
                 <div className="size-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0" style={{ backgroundColor: `var(--theme-accent)`, color: `var(--theme-primary)` }}>0{i+1}</div>
                 <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed">{item}</p>
               </div>
             ))}
           </div>
         </div>
       ) : (
         <div className="h-full flex flex-col animate-in fade-in duration-500">
           <h2 className="text-2xl font-black mb-2 tracking-tight" style={{ color: `var(--theme-primary)` }}>{current?.title}</h2>
           <div className="w-8 h-1 mb-8 rounded-full" style={{ backgroundColor: `var(--theme-primary)` }} />
           <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar focus:outline-none">
             {Array.isArray(current?.content) ? (
               <ul className="space-y-4">
                 {current.content.map((item:any, i:any) => (
                   <li key={i} className="flex items-start gap-4 group/item">
                     <div className="size-1.5 rounded-full mt-2 group-hover/item:scale-125 transition-transform" style={{ backgroundColor: `var(--theme-primary)` }} />
                     <span className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">{item}</span>
                   </li>
                 ))}
               </ul>
             ) : (
               <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium whitespace-pre-wrap">{current?.content}</p>
             )}
           </div>
         </div>
       )}

       <div className="absolute bottom-6 left-10 flex items-center gap-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
         <span className="size-1 rounded-full" style={{ backgroundColor: `#${theme.primary}` }} />
         Slide {currentSlide + 1}
       </div>
       
       <div className="absolute bottom-6 right-10 text-[10px] text-zinc-300 dark:text-zinc-600 font-black italic uppercase">
         Generated by OpenOrange
       </div>
    </div>
  )
}

export function PptRenderer({ data }: { data: PptData | string }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  
  const pptData = typeof data === "string" ? parsePartial(data) : data

  // Diagnostic logging
  useEffect(() => {
    if (typeof data === "string" && data.length > 0) {
      console.log("[PptRenderer] Received data length:", data.length)
      if (!pptData) console.warn("[PptRenderer] Failed to parse JSON (Partial stream likely)")
    }
  }, [data, pptData])

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
    const pres = new PptxGenJS()
    
    pres.layout = "LAYOUT_16x9"
    pres.title = pptData.title
    pres.author = pptData.author || "OpenOrangeAI"
    pres.company = pptData.company || "OpenOrange"

    pptData.slides.forEach((slide) => {
      const s = pres.addSlide()
      const layout = slide.layout || (slide.leftContent ? "two_column" : "bullet")
      
      // Standard spacing
      const MARGIN_X = 0.5
      
      if (layout === "title") {
        s.addText(slide.title, { 
          x: 1, y: 1.8, w: "80%", h: 1.2, 
          fontSize: 44, bold: true, color: theme.primary, align: "center", fontFace: "Arial"
        })
        if (slide.subtitle) {
          s.addText(slide.subtitle, { 
            x: 1, y: 3.2, w: "80%", h: 0.8, 
            fontSize: 24, color: theme.secondary, align: "center" 
          })
        }
        s.addShape(pres.ShapeType.rect, { x: 4.5, y: 3.1, w: 1, h: 0.05, fill: { color: theme.primary } })
      } 
      else if (layout === "two_column") {
        s.addText(slide.title, { 
          x: MARGIN_X, y: 0.3, w: "90%", h: 0.8, 
          fontSize: 32, bold: true, color: theme.primary 
        })
        
        const renderCol = (content: any, x: number) => {
          if (Array.isArray(content)) {
            s.addText(
              content.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 10] } })),
              { x: x, y: 1.5, w: "43%", h: 3.5, fontSize: 18, color: "333333" }
            )
          } else {
            s.addText(content || "", { x: x, y: 1.5, w: "43%", h: 3.5, fontSize: 18, color: "333333" })
          }
        }
        renderCol(slide.leftContent || slide.content, 0.6)
        renderCol(slide.rightContent, 5.2)
      }
      else if (layout === "hero") {
        s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "40%", h: "100%", fill: { color: theme.primary } })
        s.addText(slide.title, { 
          x: 0.3, y: 1.5, w: "34%", h: 2, 
          fontSize: 32, bold: true, color: "ffffff", align: "left" 
        })
        s.addText(
          Array.isArray(slide.content) ? slide.content.join("\n") : (slide.content || ""), 
          { x: 4.5, y: 1.5, w: "50%", h: 3, fontSize: 20, color: "333333" }
        )
      }
      else if (layout === "section") {
        s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: theme.accent } })
        s.addText(slide.subtitle || "", { x: 1, y: 1.5, w: "80%", h: 1, fontSize: 18, color: theme.primary, bold: true, align: "center" })
        s.addText(slide.title, { x: 1, y: 2.5, w: "80%", h: 1.5, fontSize: 44, bold: true, color: theme.primary, align: "center" })
      }
      else if (layout === "quote") {
        s.addText("\"", { x: 0.5, y: 0.5, w: 1, h: 1, fontSize: 100, color: "E0E0E0" })
        s.addText(slide.title, { x: 1.5, y: 1.5, w: "70%", h: 2, fontSize: 32, italic: true, color: "555555" })
        s.addText(`— ${slide.subtitle || ""}`, { x: 1.5, y: 3.5, w: "70%", h: 1, fontSize: 20, bold: true, color: theme.primary })
      }
      else if (layout === "kpi") {
        s.addText(slide.title, { x: 1, y: 1, w: "80%", h: 2, fontSize: 90, bold: true, color: theme.primary, align: "center" })
        s.addText(slide.subtitle || "", { x: 1, y: 3, w: "80%", h: 1, fontSize: 28, bold: true, color: theme.secondary, align: "center" })
        s.addText(Array.isArray(slide.content) ? slide.content.join(", ") : (slide.content||""), { x: 1, y: 4, w: "80%", h: 1, fontSize: 18, color: "666666", align: "center" })
      }
      else if (layout === "three_column") {
        s.addText(slide.title, { x: MARGIN_X, y: 0.3, w: "90%", h: 0.8, fontSize: 32, bold: true, color: theme.primary })
        const cols = Array.isArray(slide.content) ? slide.content.slice(0,3) : [String(slide.content)]
        cols.forEach((col, i) => {
          s.addShape(pres.ShapeType.rect, { x: 0.5 + (i * 3.1), y: 1.5, w: 2.8, h: 3, fill: { color: "F8F9FA" } })
          s.addText(`0${i+1}`, { x: 0.6 + (i * 3.1), y: 1.6, w: 0.8, h: 0.5, fontSize: 24, bold: true, color: theme.primary })
          s.addText(col, { x: 0.6 + (i * 3.1), y: 2.2, w: 2.6, h: 2, fontSize: 16, color: "333333" })
        })
      }
      else {
        s.addText(slide.title, { 
          x: MARGIN_X, y: 0.3, w: "90%", h: 0.8, 
          fontSize: 32, bold: true, color: theme.primary 
        })
        s.addShape(pres.ShapeType.rect, { x: MARGIN_X, y: 1.1, w: 0.5, h: 0.04, fill: { color: theme.primary } })
        
        if (Array.isArray(slide.content)) {
          s.addText(
            slide.content.map(text => ({ text, options: { bullet: true, margin: [0, 0, 0, 12] } })),
            { x: 0.8, y: 1.6, w: "85%", h: 3.8, fontSize: 18, color: "333333" }
          )
        } else if (slide.content) {
          s.addText(slide.content, { 
            x: 0.8, y: 1.6, w: "85%", h: 3.8, fontSize: 18, color: "333333" 
          })
        }
      }

      if (slide.notes) s.addNotes(slide.notes)
    })

    pres.writeFile({ fileName: `${pptData.title.replace(/\s+/g, '_')}.pptx` })
  }

  const slides = pptData.slides || []
  const current = slides[currentSlide]
  const layout = current?.layout || (current?.leftContent ? "two_column" : "bullet")

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl bg-background relative">
      {/* Header */}
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
          <Button onClick={downloadPpt} size="sm" className="h-8 px-4 gap-2 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity font-bold rounded-full shadow-lg">
            <Download className="size-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* Slide Preview Area */}
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden group/canvas">
        <SlideView slide={current} layout={layout} theme={theme} currentSlide={currentSlide} pptData={pptData} />
      </div>

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

        /* 9. Terminal / Hacker Style */
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
