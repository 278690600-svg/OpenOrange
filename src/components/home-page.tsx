"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n"
import { 
  Lightbulb, 
  Layout, 
  Smartphone, 
  Globe, 
  PieChart, 
  Box, 
  Sparkles, 
  Calculator, 
  Languages,
  ChevronRight
} from "lucide-react"

interface WelcomeHomeProps {
  onSelectPrompt: (prompt: string) => void
}

const CATEGORIES = [
  { id: 'suggested', labelKey: 'home.suggested', icon: <Lightbulb className="size-4" /> },
  { id: 'wireframe', labelKey: 'home.wireframe', icon: <Layout className="size-4" /> },
  { id: 'apps', labelKey: 'home.apps', icon: <Smartphone className="size-4" /> },
  { id: 'websites', labelKey: 'home.websites', icon: <Globe className="size-4" /> },
  { id: 'analysis', labelKey: 'home.analysis', icon: <PieChart className="size-4" /> },
  { id: 'prototype', labelKey: 'home.prototype', icon: <Box className="size-4" /> },
]

export function WelcomeHome({ onSelectPrompt }: WelcomeHomeProps) {
  const [activeTab, setActiveTab] = useState('suggested')
  const { t } = useI18n()

  const PROMPT_LISTS: Record<string, Array<{ id: number; icon: React.ReactNode; text: string; prompt: string }>> = {
    suggested: [
      { id: 1, icon: <Sparkles className="size-4" />, text: t("home.suggested.1.text"), prompt: t("home.suggested.1.prompt") },
      { id: 2, icon: <Calculator className="size-4" />, text: t("home.suggested.2.text"), prompt: t("home.suggested.2.prompt") },
      { id: 3, icon: <Globe className="size-4" />, text: t("home.suggested.3.text"), prompt: t("home.suggested.3.prompt") },
      { id: 4, icon: <Lightbulb className="size-4" />, text: t("home.suggested.4.text"), prompt: t("home.suggested.4.prompt") },
      { id: 5, icon: <Languages className="size-4" />, text: t("home.suggested.5.text"), prompt: t("home.suggested.5.prompt") },
    ],
    wireframe: [
      { id: 6, icon: <Layout className="size-4" />, text: t("home.wireframe.1.text"), prompt: t("home.wireframe.1.prompt") },
      { id: 7, icon: <Layout className="size-4" />, text: t("home.wireframe.2.text"), prompt: t("home.wireframe.2.prompt") },
      { id: 8, icon: <Layout className="size-4" />, text: t("home.wireframe.3.text"), prompt: t("home.wireframe.3.prompt") },
      { id: 9, icon: <Layout className="size-4" />, text: t("home.wireframe.4.text"), prompt: t("home.wireframe.4.prompt") },
      { id: 10, icon: <Layout className="size-4" />, text: t("home.wireframe.5.text"), prompt: t("home.wireframe.5.prompt") },
    ],
    apps: [
      { id: 11, icon: <Smartphone className="size-4" />, text: t("home.apps.1.text"), prompt: t("home.apps.1.prompt") },
      { id: 12, icon: <Smartphone className="size-4" />, text: t("home.apps.2.text"), prompt: t("home.apps.2.prompt") },
      { id: 13, icon: <Smartphone className="size-4" />, text: t("home.apps.3.text"), prompt: t("home.apps.3.prompt") },
      { id: 14, icon: <Smartphone className="size-4" />, text: t("home.apps.4.text"), prompt: t("home.apps.4.prompt") },
      { id: 15, icon: <Smartphone className="size-4" />, text: t("home.apps.5.text"), prompt: t("home.apps.5.prompt") },
    ],
    websites: [
      { id: 16, icon: <Globe className="size-4" />, text: t("home.websites.1.text"), prompt: t("home.websites.1.prompt") },
      { id: 17, icon: <Globe className="size-4" />, text: t("home.websites.2.text"), prompt: t("home.websites.2.prompt") },
      { id: 18, icon: <Globe className="size-4" />, text: t("home.websites.3.text"), prompt: t("home.websites.3.prompt") },
      { id: 19, icon: <Globe className="size-4" />, text: t("home.websites.4.text"), prompt: t("home.websites.4.prompt") },
      { id: 20, icon: <Globe className="size-4" />, text: t("home.websites.5.text"), prompt: t("home.websites.5.prompt") },
    ],
    analysis: [
      { id: 21, icon: <PieChart className="size-4" />, text: t("home.analysis.1.text"), prompt: t("home.analysis.1.prompt") },
      { id: 22, icon: <PieChart className="size-4" />, text: t("home.analysis.2.text"), prompt: t("home.analysis.2.prompt") },
      { id: 23, icon: <PieChart className="size-4" />, text: t("home.analysis.3.text"), prompt: t("home.analysis.3.prompt") },
      { id: 24, icon: <PieChart className="size-4" />, text: t("home.analysis.4.text"), prompt: t("home.analysis.4.prompt") },
      { id: 25, icon: <PieChart className="size-4" />, text: t("home.analysis.5.text"), prompt: t("home.analysis.5.prompt") },
    ],
    prototype: [
      { id: 26, icon: <Box className="size-4" />, text: t("home.prototype.1.text"), prompt: t("home.prototype.1.prompt") },
      { id: 27, icon: <Box className="size-4" />, text: t("home.prototype.2.text"), prompt: t("home.prototype.2.prompt") },
      { id: 28, icon: <Box className="size-4" />, text: t("home.prototype.3.text"), prompt: t("home.prototype.3.prompt") },
      { id: 29, icon: <Box className="size-4" />, text: t("home.prototype.4.text"), prompt: t("home.prototype.4.prompt") },
      { id: 30, icon: <Box className="size-4" />, text: t("home.prototype.5.text"), prompt: t("home.prototype.5.prompt") },
    ]
  }

  const currentList = PROMPT_LISTS[activeTab] || PROMPT_LISTS.suggested

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-[1.5rem] overflow-hidden shadow-xl shadow-zinc-200/20 dark:shadow-none flex flex-col">
        
        {/* Tabs Filter - Improved adaptation */}
        <div className="flex items-center w-full justify-between sm:justify-start px-2 py-1.5 sm:px-3 sm:py-2 gap-1 border-b border-zinc-50 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === cat.id 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <span className="hidden sm:inline-flex scale-90">
                {cat.icon}
              </span>
              {t(cat.labelKey)}
            </button>
          ))}
        </div>

        {/* Prompt List - Flexible sizing */}
        <div className="flex-1 p-2 md:p-4 space-y-1 overflow-y-auto max-h-[360px] sm:max-h-[480px] app-scrollbar">
          {currentList.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectPrompt(item.prompt)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all group text-left border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 active:scale-[0.99]"
            >
              <div className="size-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-500 group-hover:bg-white dark:group-hover:bg-zinc-700 group-hover:text-primary transition-all shrink-0 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
                <div className="scale-75">{item.icon}</div>
              </div>
              
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors leading-normal font-medium line-clamp-2 md:line-clamp-1">
                  {item.text}
                </span>
              </div>
              
              <div className="opacity-0 group-hover:opacity-100 transition-all transform -translate-x-1 group-hover:translate-x-0 hidden md:block">
                <ChevronRight className="size-3.5 text-zinc-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
      
      <div className="mt-6 flex items-center gap-3 text-zinc-400/40 transition-opacity hover:opacity-100">
        <div className="h-px w-6 bg-current" />
        <p className="text-[9px] uppercase tracking-[0.2em] font-black">{t("Premium Experience") || "PREMIUM EXPERIENCE"}</p>
        <div className="h-px w-6 bg-current" />
      </div>
    </div>
  )
}
