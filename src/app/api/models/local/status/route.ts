import { NextResponse } from 'next/server'

export async function GET() {
  const g = globalThis as any
  const cache = g.localGgufCache

  if (!cache || !cache.isLoaded) {
    return NextResponse.json({
      isLoaded: false,
      modelPath: null,
      modelName: null
    })
  }

  // 获取文件名而不是完整路径
  const modelName = cache.modelPath.split(/[\/\\]/).pop() || 'Unknown Model'

  return NextResponse.json({
    isLoaded: true,
    modelPath: cache.modelPath,
    modelName
  })
}

export async function DELETE() {
  const g = globalThis as any
  const cache = g.localGgufCache

  if (cache) {
    try {
      if (cache.session) {
        // Disposing sequence is usually enough but we can clear ref
        cache.session = null
      }
      if (cache.context) {
        await cache.context.dispose()
      }
      if (cache.model) {
        await cache.model.dispose()
      }
    } catch (e) {
      console.error('[Local GGUF] Error unloading model:', e)
    }

    g.localGgufCache = {
      modelPath: null,
      model: null,
      context: null,
      session: null,
      isLoaded: false
    }
  }

  return NextResponse.json({ success: true, message: 'Model unloaded from VRAM.' })
}
