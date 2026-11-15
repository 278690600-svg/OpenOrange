import { NextRequest, NextResponse } from "next/server"
import { mcpLogger } from "@/lib/mcp-logger"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const action = searchParams.get("action")

  try {
    if (action === "stats") {
      const stats = await mcpLogger.getStats()
      return NextResponse.json(stats)
    }

    if (action === "daily") {
      const days = parseInt(searchParams.get("days") || "30", 10)
      const data = await mcpLogger.getToolUsageByDay(days)
      return NextResponse.json(data)
    }

    // Default: list logs
    const toolName = searchParams.get("toolName") || undefined
    const serverName = searchParams.get("serverName") || undefined
    const chatId = searchParams.get("chatId") || undefined
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const dateFrom = searchParams.get("dateFrom")
      ? new Date(searchParams.get("dateFrom")!)
      : undefined
    const dateTo = searchParams.get("dateTo")
      ? new Date(searchParams.get("dateTo")!)
      : undefined

    const { logs, total } = await mcpLogger.getLogs({
      toolName,
      serverName,
      chatId,
      limit,
      offset,
      dateFrom,
      dateTo,
    })

    return NextResponse.json({ logs, total })
  } catch (error) {
    console.error("[MCP Logs API] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const olderThan = searchParams.get("olderThan")

  if (!olderThan) {
    return NextResponse.json(
      { error: "Missing 'olderThan' parameter (e.g. '30d')" },
      { status: 400 }
    )
  }

  const daysMatch = olderThan.match(/^(\d+)d$/)
  if (!daysMatch) {
    return NextResponse.json(
      { error: "Invalid format. Use 'Nd' where N is number of days, e.g. '30d'" },
      { status: 400 }
    )
  }

  const days = parseInt(daysMatch[1], 10)

  try {
    const { count } = await mcpLogger.deleteOlderThan(days)
    return NextResponse.json({ deleted: count })
  } catch (error) {
    console.error("[MCP Logs API] Error deleting old logs:", error)
    return NextResponse.json(
      { error: "Failed to delete old logs" },
      { status: 500 }
    )
  }
}
