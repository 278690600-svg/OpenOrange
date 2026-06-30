"use client"

import { useState } from "react"
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
  { id: 'suggested', label: 'Suggested', icon: <Lightbulb className="size-4" /> },
  { id: 'wireframe', label: 'Wireframe', icon: <Layout className="size-4" /> },
  { id: 'apps', label: 'Apps', icon: <Smartphone className="size-4" /> },
  { id: 'websites', label: 'Websites', icon: <Globe className="size-4" /> },
  { id: 'analysis', label: 'Analysis', icon: <PieChart className="size-4" /> },
  { id: 'prototype', label: 'Prototype', icon: <Box className="size-4" /> },
]

const PROMPT_LISTS: Record<string, any[]> = {
  suggested: [
    { id: 1, icon: <Sparkles className="size-4" />, text: "A developer portfolio with dark theme, project cards, and contact form.", prompt: "Design a developer portfolio with dark theme, project cards, and contact form." },
    { id: 2, icon: <Calculator className="size-4" />, text: "A modern SaaS landing page for a time-tracking app.", prompt: "Create a modern SaaS landing page for a time-tracking app." },
    { id: 3, icon: <Globe className="size-4" />, text: "What are the latest AI breakthroughs this month?", prompt: "What are the latest AI breakthroughs this month?" },
    { id: 4, icon: <Lightbulb className="size-4" />, text: "Creative gift ideas for a 30th birthday on a budget.", prompt: "Give me creative gift ideas for a 30th birthday on a budget." },
    { id: 5, icon: <Languages className="size-4" />, text: "Translate this English business proposal into professional Chinese.", prompt: "Translate this English business proposal into professional Chinese: [Insert content]" },
  ],
  wireframe: [
    { id: 6, icon: <Layout className="size-4" />, text: "Clean blog layout with focus on typography and readability.", prompt: "Design a clean blog layout with focus on typography and readability." },
    { id: 7, icon: <Layout className="size-4" />, text: "SaaS dashboard wireframe with sidebar and data widgets.", prompt: "Wireframe a SaaS dashboard with sidebar and data widgets." },
  ],
  apps: [
    { id: 8, icon: <Smartphone className="size-4" />, text: "Fitness tracking app design with custom workout plans.", prompt: "Design a fitness tracking app with custom workout plans." },
    { id: 9, icon: <Smartphone className="size-4" />, text: "Daily journal app with mood tracking and prompts.", prompt: "Create a UI for a daily journal app with mood tracking." },
  ],
  websites: [
    { id: 10, icon: <Globe className="size-4" />, text: "E-commerce dashboard for tracking global sales.", prompt: "Design an e-commerce dashboard for tracking global sales." },
  ],
  analysis: [
    { id: 11, icon: <PieChart className="size-4" />, text: "Analyze monthly sales trends and customer demographic data.", prompt: "Analyze monthly sales trends and customer demographic data." },
  ],
  prototype: [
    { id: 12, icon: <Box className="size-4" />, text: "Interactive 3D model viewer for architectural product pages.", prompt: "Prototype an interactive 3D model viewer for architectural products." },
  ]
}

export function WelcomeHome({ onSelectPrompt }: WelcomeHomeProps) {
  const [activeTab, setActiveTab] = useState('suggested')
  const currentList = PROMPT_LISTS[activeTab] || PROMPT_LISTS.suggested

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-[1.5rem] overflow-hidden shadow-xl shadow-zinc-200/20 dark:shadow-none flex flex-col">
        
        {/* Tabs Filter - Improved adaptation */}
        <div className="flex items-center px-3 py-2 overflow-x-auto no-scrollbar gap-1 border-b border-zinc-50 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === cat.id 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <span className={`scale-90 ${activeTab === cat.id ? '' : 'text-zinc-400'}`}>
                {cat.icon}
              </span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Prompt List - Flexible sizing */}
        <div className="flex-1 p-2 md:p-4 space-y-1 overflow-y-auto max-h-[480px] app-scrollbar">
          {currentList.map((item, i) => (
            <button
              key={item.id}
              onClick={() => onSelectPrompt(item.prompt)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all group text-left border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 active:scale-[0.99]"
            >
              <div className="size-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-500 group-hover:bg-white dark:group-hover:bg-zinc-700 group-hover:text-primary transition-all shrink-0 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
                <div className="scale-75">{item.icon}</div>
              </div>
              
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors leading-normal font-medium line-clamp-1">
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
        <p className="text-[9px] uppercase tracking-[0.2em] font-black">Premium Experience</p>
        <div className="h-px w-6 bg-current" />
      </div>
    </div>
  )
}
