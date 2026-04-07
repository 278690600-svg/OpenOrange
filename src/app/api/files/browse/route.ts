import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Security: restrict browsable roots to sensible defaults
// Allow browsing from drive root, home dir, and common locations
const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', '$Recycle.Bin', 'System Volume Information', 'Windows'])

type FsEntry = {
  name: string
  path: string
  type: 'directory' | 'file'
  size?: number
  ext?: string
  modifiedAt?: string
  children?: FsEntry[]
}

function getSystemRoots(): FsEntry[] {
  const platform = process.platform
  if (platform === 'win32') {
    // List available drive letters
    const drives: FsEntry[] = []
    for (let i = 65; i <= 90; i++) {
      const driveLetter = String.fromCharCode(i) + ':\\'
      if (fs.existsSync(driveLetter)) {
        drives.push({ name: driveLetter, path: driveLetter, type: 'directory' })
      }
    }
    return drives
  } else {
    return [
      { name: '/', path: '/', type: 'directory' },
      { name: 'Home', path: os.homedir(), type: 'directory' },
    ]
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const requestedPath = searchParams.get('path')
  const mode = searchParams.get('mode') || 'dirs' // 'dirs' | 'all'

  // Return system roots when no path given
  if (!requestedPath || requestedPath === '' || requestedPath === '/') {
    return NextResponse.json({ entries: getSystemRoots(), currentPath: '', parent: null })
  }

  let resolvedPath: string
  try {
    resolvedPath = path.resolve(requestedPath)
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Verify path exists and is a directory
  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'Path does not exist', path: resolvedPath }, { status: 404 })
  }

  const stat = fs.statSync(resolvedPath)
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 })
  }

  try {
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true })
    const result: FsEntry[] = []

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue

      const fullPath = path.join(resolvedPath, entry.name)

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
        })
      } else if (mode === 'all') {
        try {
          const fileStat = fs.statSync(fullPath)
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
            size: fileStat.size,
            ext: path.extname(entry.name).toLowerCase().slice(1),
            modifiedAt: fileStat.mtime.toISOString(),
          })
        } catch { continue }
      }
    }

    // Sort: directories first, then files alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' })
    })

    // Compute parent path
    const parentPath = path.dirname(resolvedPath)
    const parent = parentPath !== resolvedPath ? parentPath : null

    return NextResponse.json({
      entries: result,
      currentPath: resolvedPath,
      parent,
      dirInfo: {
        name: path.basename(resolvedPath) || resolvedPath,
        totalEntries: result.length,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Cannot read directory: ${err.message}` }, { status: 500 })
  }
}
