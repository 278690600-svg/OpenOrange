import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const note = await prisma.note.findUnique({
      where: { id }
    })
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }
    return NextResponse.json({ note })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, content, folder, tags, pinned, starred } = body

    const data: any = {}
    if (title !== undefined) data.title = title
    if (content !== undefined) data.content = content
    if (folder !== undefined) data.folder = folder
    if (tags !== undefined) data.tags = typeof tags === 'string' ? tags : JSON.stringify(tags)
    if (pinned !== undefined) data.pinned = pinned
    if (starred !== undefined) data.starred = starred

    const updated = await prisma.note.update({
      where: { id },
      data
    })
    return NextResponse.json({ success: true, note: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.note.delete({
      where: { id }
    })
    return NextResponse.json({ success: true, message: "Note deleted" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
