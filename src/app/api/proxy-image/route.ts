import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    })

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
         let fallbackUrl = 'https://loremflickr.com/1280/720/business,modern?random=1'
         const match = url.match(/prompt\/([^?]+)/)
         if (match) {
            const keywords = decodeURIComponent(match[1]).split(/[\s%20_-]+/).filter(w => w.length > 3).slice(0, 2).join(',')
            if (keywords) {
              fallbackUrl = `https://loremflickr.com/1280/720/${keywords}?random=${Math.floor(Math.random()*1000)}`
            }
         }
         const fallback = await fetch(fallbackUrl)
         const fContentType = fallback.headers.get('content-type')
         const fBuffer = await fallback.arrayBuffer()
         return new NextResponse(fBuffer, {
            headers: {
              'Content-Type': fContentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*'
            }
         })
      }
      return new NextResponse(`Failed to fetch image: ${response.status}`, { status: response.status })
    }

    const contentType = response.headers.get('content-type')
    const buffer = await response.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error: any) {
    console.error('Proxy proxy-image Error:', error)
    return new NextResponse(`Error fetching image: ${error.message}`, { status: 500 })
  }
}
