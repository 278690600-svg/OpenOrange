"use client"

import { ExternalLink, Globe } from "lucide-react"

interface Citation {
  title: string
  url: string
}

export function CitationsBar({ citations, engine }: { citations: Citation[]; engine?: string }) {
  if (!citations || citations.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-zinc-500">
        <Globe className="size-3" />
        <span>Sources</span>
        {engine && <span className="capitalize text-zinc-400">· {engine}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((c, i) => (
          <a
            key={i}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors max-w-[200px]"
          >
            <span className="shrink-0 w-4 h-4 rounded flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold">{i + 1}</span>
            <span className="truncate text-zinc-700 dark:text-zinc-200">{c.title}</span>
            <ExternalLink className="size-2.5 shrink-0 text-zinc-400" />
          </a>
        ))}
      </div>
    </div>
  )
}
