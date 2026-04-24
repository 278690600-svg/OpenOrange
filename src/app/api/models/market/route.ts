import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('search') || ''
  
  // Search Hugging Face for GGUF models
  // We prioritize models with "gguf" in the name or tag, sorted by downloads
  const hfUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(query + ' gguf')}&sort=downloads&direction=-1&limit=20&full=true`
  
  try {
    const response = await fetch(hfUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'ClosedUI/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`HF API error: ${response.statusText}`)
    }
    
    const models = await response.json()
    
    // Process models to extract relevant info for the UI
    const processedModels = models.map((m: any) => {
      // Find GGUF files in the sibling files
      const ggufFiles = (m.siblings || [])
        .filter((s: any) => s.rfilename.endsWith('.gguf'))
        .map((s: any) => s.rfilename)
      
      return {
        id: m.id,
        name: m.id.split('/').pop(),
        author: m.author,
        downloads: m.downloads,
        likes: m.likes,
        updated: m.lastModified,
        tags: m.tags,
        ggufFiles: ggufFiles,
        description: m.description || ""
      }
    }).filter((m: any) => m.ggufFiles.length > 0)
    
    return NextResponse.json({ models: processedModels })
  } catch (error: any) {
    console.error('[Market API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
