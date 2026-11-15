import { NextRequest, NextResponse } from "next/server"

// GET /api/notes/links?noteId=X - Get links and backlinks for a note
// POST /api/notes/links - Create a manual link between notes
// DELETE /api/notes/links?sourceId=X&targetId=Y - Remove a link

const LINKS_STORAGE_KEY = "note-links"

interface NoteLinkRecord {
  id: string
  sourceNoteId: string
  targetNoteId: string
  linkType: "reference" | "mention" | "related"
  createdAt: string
}

function getLinks(): NoteLinkRecord[] {
  const raw = localStorage.getItem(LINKS_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function setLinks(links: NoteLinkRecord[]) {
  // This won't work in a server environment - placeholder for future Prisma migration
  // In the current localStorage-only architecture, links are managed client-side
  console.warn("Server-side link persistence not available. Use client-side syncLinks() instead.")
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const noteId = searchParams.get("noteId")

  if (!noteId) {
    // Return all links
    const links = getLinks()
    return NextResponse.json({ links })
  }

  const links = getLinks()
  const outgoing = links.filter(l => l.sourceNoteId === noteId)
  const backlinks = links.filter(l => l.targetNoteId === noteId)

  return NextResponse.json({ outgoing, backlinks })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { sourceNoteId, targetNoteId, linkType = "mention" } = body

  if (!sourceNoteId || !targetNoteId) {
    return NextResponse.json(
      { error: "sourceNoteId and targetNoteId are required" },
      { status: 400 }
    )
  }

  // Placeholder: in localStorage mode this is handled client-side
  // This endpoint exists for future Prisma migration
  return NextResponse.json({
    id: `link-${Date.now()}`,
    sourceNoteId,
    targetNoteId,
    linkType,
    createdAt: new Date().toISOString(),
    note: "Link creation is handled client-side via localStorage. This endpoint will support Prisma in the future."
  })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get("sourceId")
  const targetId = searchParams.get("targetId")

  if (!sourceId || !targetId) {
    return NextResponse.json(
      { error: "sourceId and targetId are required" },
      { status: 400 }
    )
  }

  // Placeholder: in localStorage mode this is handled client-side
  return NextResponse.json({
    deleted: true,
    note: "Link deletion is handled client-side via localStorage. This endpoint will support Prisma in the future."
  })
}
