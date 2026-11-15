import { NextResponse } from 'next/server'

const MAX_URL_LENGTH = 2048

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^::ffff:127\./,
  /^fc00:/i,
  /^fe80:/i,
]

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(regex => regex.test(ip))
}

async function resolveAndCheckIP(hostname: string): Promise<boolean> {
  try {
    const { lookup } = await import('dns')
    return new Promise<boolean>((resolve) => {
      lookup(hostname, (err, address) => {
        if (err) { resolve(false); return }
        resolve(isPrivateIP(address))
      })
    })
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  // URL length limit
  if (url.length > MAX_URL_LENGTH) {
    return new NextResponse('URL too long', { status: 400 })
  }

  // Protocol check - only allow http/https
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return new NextResponse('Only http/https protocols are allowed', { status: 400 })
  }

  // Private IP check
  const hostname = parsedUrl.hostname
  if (isPrivateIP(hostname)) {
    return new NextResponse('Private IP addresses are not allowed', { status: 403 })
  }

  // DNS rebinding check
  const isPrivate = await resolveAndCheckIP(hostname)
  if (isPrivate) {
    return new NextResponse('Resolved to private IP address', { status: 403 })
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
      }
    })
  } catch (error: unknown) {
    console.error('Proxy proxy-image Error:', error)
    return new NextResponse(`Error fetching image: ${(error as Error).message}`, { status: 500 })
  }
}
