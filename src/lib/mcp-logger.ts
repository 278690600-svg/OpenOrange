import prisma from "@/lib/db"

export interface LogToolCallParams {
  toolName: string
  serverName: string
  args: Record<string, unknown>
  result: unknown
  status: "success" | "error"
  duration: number
  chatId?: string
}

export interface GetLogsOptions {
  toolName?: string
  serverName?: string
  chatId?: string
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
}

export interface DailyUsageEntry {
  date: string
  count: number
  successCount: number
  errorCount: number
  avgDuration: number
}

export interface StatsResult {
  totalCalls: number
  successRate: number
  avgDuration: number
  mostUsedTools: { toolName: string; count: number }[]
}

export class McpLogger {
  async logToolCall({
    toolName,
    serverName,
    args,
    result,
    status,
    duration,
    chatId,
  }: LogToolCallParams): Promise<void> {
    try {
      await prisma.mcpToolLog.create({
        data: {
          toolName,
          serverName,
          arguments: JSON.stringify(args),
          result: typeof result === "string" ? result : JSON.stringify(result),
          status,
          duration,
          chatId,
        },
      })
    } catch (error) {
      console.error("[MCP Logger] Failed to log tool call:", error)
    }
  }

  async getLogs({
    toolName,
    serverName,
    chatId,
    limit = 50,
    offset = 0,
    dateFrom,
    dateTo,
  }: GetLogsOptions = {}) {
    const where: Record<string, unknown> = {}
    if (toolName) where.toolName = { contains: toolName }
    if (serverName) where.serverName = { contains: serverName }
    if (chatId) where.chatId = chatId
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) (where.createdAt as Record<string, Date>).gte = dateFrom
      if (dateTo) (where.createdAt as Record<string, Date>).lte = dateTo
    }

    const [logs, total] = await Promise.all([
      prisma.mcpToolLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.mcpToolLog.count({ where }),
    ])

    return { logs, total }
  }

  async getStats(): Promise<StatsResult> {
    const totalCalls = await prisma.mcpToolLog.count()

    if (totalCalls === 0) {
      return { totalCalls: 0, successRate: 0, avgDuration: 0, mostUsedTools: [] }
    }

    const successCount = await prisma.mcpToolLog.count({
      where: { status: "success" },
    })

    const avgResult = await prisma.mcpToolLog.aggregate({
      _avg: { duration: true },
    })

    const toolUsage = await prisma.mcpToolLog.groupBy({
      by: ["toolName"],
      _count: { toolName: true },
      orderBy: { _count: { toolName: "desc" } },
      take: 10,
    })

    return {
      totalCalls,
      successRate: (successCount / totalCalls) * 100,
      avgDuration: Math.round(avgResult._avg.duration ?? 0),
      mostUsedTools: toolUsage.map((t) => ({
        toolName: t.toolName,
        count: t._count.toolName,
      })),
    }
  }

  async getToolUsageByDay(days: number = 30): Promise<DailyUsageEntry[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    const logs = await prisma.mcpToolLog.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
        duration: true,
      },
    })

    const dailyMap = new Map<string, { count: number; successCount: number; errorCount: number; totalDuration: number }>()

    for (const log of logs) {
      const dateKey = log.createdAt.toISOString().split("T")[0]
      const entry = dailyMap.get(dateKey) || { count: 0, successCount: 0, errorCount: 0, totalDuration: 0 }
      entry.count++
      if (log.status === "success") entry.successCount++
      else entry.errorCount++
      entry.totalDuration += log.duration
      dailyMap.set(dateKey, entry)
    }

    const result: DailyUsageEntry[] = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateKey = date.toISOString().split("T")[0]
      const entry = dailyMap.get(dateKey)
      result.push({
        date: dateKey,
        count: entry?.count ?? 0,
        successCount: entry?.successCount ?? 0,
        errorCount: entry?.errorCount ?? 0,
        avgDuration: entry ? Math.round(entry.totalDuration / entry.count) : 0,
      })
    }

    return result
  }

  async deleteOlderThan(days: number): Promise<{ count: number }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const result = await prisma.mcpToolLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    })

    return { count: result.count }
  }
}

export const mcpLogger = new McpLogger()
