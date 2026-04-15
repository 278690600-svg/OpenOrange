import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getLocalModelsDir } from '@/lib/models'

export async function POST(req: Request) {
  const { modelId, fileName } = await req.json()
  if (!modelId || !fileName) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${fileName}`
  const targetDir = getLocalModelsDir()
  const targetPath = path.join(targetDir, fileName)

  // Ensure directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // SSE Stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendStatus = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        sendStatus({ status: 'connecting', message: `Connecting to Hugging Face...` })
        
        const response = await fetch(downloadUrl)
        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText} (${response.status})`)
        }
        
        const contentLength = +(response.headers.get('Content-Length') || 0)
        let downloaded = 0
        
        const fileStream = fs.createWriteStream(targetPath)
        
        // Use the response body as a stream
        const body = response.body
        if (!body) throw new Error('Empty response body')
        
        const reader = body.getReader()
        let lastUpdate = 0
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          fileStream.write(Buffer.from(value))
          downloaded += value.length
          
          const now = Date.now()
          if (now - lastUpdate > 500) { // Update progress every 500ms
            const progress = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0
            sendStatus({ 
              status: 'downloading', 
              progress, 
              downloadedMB: (downloaded / 1024 / 1024).toFixed(1),
              totalMB: (contentLength / 1024 / 1024).toFixed(1)
            })
            lastUpdate = now
          }
        }
        
        fileStream.end()
        sendStatus({ status: 'done', message: 'Download complete!', path: fileName })
        controller.close()
      } catch (error: any) {
        console.error('[Download API] Error:', error)
        sendStatus({ status: 'error', message: error.message })
        controller.close()
      }
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
