import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const q = searchParams.get("q") || ""
  const dateFilter = searchParams.get("date") // today, yesterday, week, month

  let where: any = {}

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { messages: { some: { content: { contains: q } } } }
    ]
  }

  if (dateFilter) {
    const now = new Date()
    let startDate: Date | null = null
    let endDate: Date | null = null

    if (dateFilter === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (dateFilter === "yesterday") {
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    } else if (dateFilter === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (dateFilter === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = startDate
      if (endDate) where.createdAt.lt = endDate
    }
  }

  try {
    const results = await prisma.chat.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: { messages: true }
        }
      }
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Failed to search chats" }, { status: 500 })
  }
}
