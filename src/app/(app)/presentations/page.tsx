'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const PresentationManager = dynamic(() => import('@/components/presentation-manager').then(mod => mod.PresentationManager), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground font-medium">Loading Presentation Studio...</span>
    </div>
  )
})

export default function PresentationsPage() {
  return <PresentationManager />
}
