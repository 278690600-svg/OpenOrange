import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// GET /api/notes - List all notes
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const folder = searchParams.get('folder')
    const search = searchParams.get('search')

    const where: any = {}
    if (folder) where.folder = folder
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } }
      ]
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({ notes })
  } catch (error: any) {
    console.error("Notes GET Error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch notes" }, { status: 500 })
  }
}

// POST /api/notes - Create a note
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, content, folder, tags, pinned, starred } = body

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const note = await prisma.note.create({
      data: {
        title,
        content: content || "",
        folder: folder || "default",
        tags: typeof tags === 'string' ? tags : JSON.stringify(tags || []),
        pinned: !!pinned,
        starred: !!starred
      }
    })

    return NextResponse.json({ success: true, note })
  } catch (error: any) {
    console.error("Notes POST Error:", error)
    return NextResponse.json({ error: error.message || "Failed to create note" }, { status: 500 })
  }
}
