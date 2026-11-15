'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const OcrProcessor = dynamic(() => import('@/components/ocr-processor').then(mod => mod.OcrProcessor), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground font-medium">Loading OCR Processor...</span>
    </div>
  )
})

export default function OcrPage() {
  return <OcrProcessor />
}
