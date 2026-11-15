'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const ConversionCenter = dynamic(() => import('@/components/conversion-center').then(mod => mod.ConversionCenter), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground font-medium">Loading Conversion Center...</span>
    </div>
  )
})

export default function ConversionPage() {
  return <ConversionCenter />
}
