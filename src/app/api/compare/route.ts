import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified'
  oldLine?: number
  newLine?: number
  content: string
  highlighted?: string
}

interface DiffResult {
  oldTitle: string
  newTitle: string
  diffLines: DiffLine[]
  stats: {
    added: number
    removed: number
    modified: number
    unchanged: number
  }
  similarity: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, oldContent, newContent, oldId, newId, format } = body

    if (action === 'compare') {
      if (!oldContent || !newContent) {
        return NextResponse.json({ error: 'Both old and new content required' }, { status: 400 })
      }

      const diffResult = computeDiff(oldContent, newContent)
      return NextResponse.json({ diff: diffResult })
    }

    if (action === 'compare-documents') {
      const oldDoc = await prisma.document.findUnique({ where: { id: oldId } })
      const newDoc = await prisma.document.findUnique({ where: { id: newId } })

      if (!oldDoc || !newDoc) {
        return NextResponse.json({ error: 'Documents not found' }, { status: 404 })
      }

      const diffResult = computeDiff(oldDoc.content, newDoc.content, oldDoc.title, newDoc.title)
      return NextResponse.json({ diff: diffResult })
    }

    if (action === 'generate-report') {
      const { diff, format: reportFormat } = body
      const report = generateDiffReport(diff, reportFormat || 'html')
      return new NextResponse(report, {
        headers: {
          'Content-Type': reportFormat === 'pdf' ? 'application/pdf' : 'text/html',
          'Content-Disposition': `attachment; filename="diff-report.${reportFormat}"`
        }
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: 'Comparison failed', details: (err as Error).message }, { status: 500 })
  }
}

function computeDiff(oldText: string, newText: string, oldTitle = 'Old Document', newTitle = 'New Document'): DiffResult {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  
  const diffLines: DiffLine[] = []
  const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 }
  
  const maxLines = Math.max(oldLines.length, newLines.length)
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    
    if (oldLine === undefined && newLine !== undefined) {
      diffLines.push({ type: 'added', newLine: i + 1, content: newLine })
      stats.added++
    } else if (oldLine !== undefined && newLine === undefined) {
      diffLines.push({ type: 'removed', oldLine: i + 1, content: oldLine })
      stats.removed++
    } else if (oldLine === newLine) {
      diffLines.push({ type: 'unchanged', oldLine: i + 1, newLine: i + 1, content: oldLine })
      stats.unchanged++
    } else {
      const highlighted = highlightDifferences(oldLine, newLine)
      diffLines.push({ type: 'modified', oldLine: i + 1, newLine: i + 1, content: newLine, highlighted })
      stats.modified++
    }
  }
  
  const totalLines = maxLines
  const similarity = totalLines > 0 ? (stats.unchanged / totalLines) * 100 : 100
  
  return {
    oldTitle,
    newTitle,
    diffLines,
    stats,
    similarity
  }
}

function highlightDifferences(oldLine: string, newLine: string): string {
  let result = newLine
  const oldWords = oldLine.split(/\s+/)
  const newWords = newLine.split(/\s+/)
  
  const changedWords = newWords.filter(word => !oldWords.includes(word))
  
  changedWords.forEach(word => {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g')
    result = result.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-500/40">$1</mark>')
  })
  
  return result
}

function generateDiffReport(diff: DiffResult, format: string): string {
  if (format === 'html') {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Document Comparison Report</title>
          <style>
            body { font-family: -apple-system, sans-serif; margin: 40px; line-height: 1.6; }
            .header { margin-bottom: 30px; }
            .stats { display: flex; gap: 20px; margin: 20px 0; }
            .stat { padding: 15px; border-radius: 8px; flex: 1; }
            .added { background: #d4edda; }
            .removed { background: #f8d7da; }
            .modified { background: #fff3cd; }
            .diff-line { padding: 4px 8px; margin: 2px 0; border-radius: 4px; font-family: monospace; font-size: 14px; }
            .added-line { background: #d4edda; }
            .removed-line { background: #f8d7da; }
            .modified-line { background: #fff3cd; }
            mark { background: #ffeb3b; padding: 2px 4px; border-radius: 2px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Document Comparison Report</h1>
            <p><strong>Similarity:</strong> ${diff.similarity.toFixed(1)}%</p>
          </div>
          <div class="stats">
            <div class="stat added"><strong>+${diff.stats.added}</strong> lines added</div>
            <div class="stat removed"><strong>-${diff.stats.removed}</strong> lines removed</div>
            <div class="stat modified"><strong>~${diff.stats.modified}</strong> lines modified</div>
          </div>
          <h3>Changes</h3>
          ${diff.diffLines.map(line => {
            if (line.type === 'unchanged') return ''
            const className = line.type === 'added' ? 'added-line' : line.type === 'removed' ? 'removed-line' : 'modified-line'
            const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '~'
            return `<div class="diff-line ${className}">${prefix} Line ${line.newLine || line.oldLine}: ${line.highlighted || line.content}</div>`
          }).join('')}
        </body>
      </html>
    `
  }
  
  return 'Report generation for this format is not supported'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'list-versions') {
    const docId = searchParams.get('docId')
    if (!docId) {
      return NextResponse.json({ error: 'docId required' }, { status: 400 })
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: docId },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    return NextResponse.json({ versions })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
