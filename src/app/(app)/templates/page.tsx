'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const TemplateCenter = dynamic(() => import('@/components/template-center').then(mod => mod.TemplateCenter), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground font-medium">Loading Template Center...</span>
    </div>
  )
})

export default function TemplatesPage() {
  return <TemplateCenter />
}
