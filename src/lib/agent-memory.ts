import prisma from '@/lib/db'

interface MemoryContext {
  userProfile: Record<string, unknown>
  preferences: Record<string, unknown>
  recentContext: Array<{ key: string; value: unknown; confidence: number }>
  relevantFacts: Array<{ key: string; value: unknown; confidence: number }>
}

export async function buildMemoryContext(chatId?: string): Promise<MemoryContext> {
  const now = new Date()

  const activeMemories = await prisma.agentMemory.findMany({
    where: {
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } }
      ],
      confidence: { gte: 0.5 }
    },
    orderBy: { confidence: 'desc' },
    take: 100
  })

  const context: MemoryContext = {
    userProfile: {},
    preferences: {},
    recentContext: [],
    relevantFacts: []
  }

  for (const memory of activeMemories) {
    try {
      const value = JSON.parse(memory.value)

      switch (memory.category) {
        case 'user_profile':
          context.userProfile[memory.key] = value
          break
        case 'preference':
          context.preferences[memory.key] = value
          break
        case 'context':
          context.recentContext.push({
            key: memory.key,
            value,
            confidence: memory.confidence
          })
          break
        case 'fact':
          context.relevantFacts.push({
            key: memory.key,
            value,
            confidence: memory.confidence
          })
          break
      }
    } catch {
      // Skip invalid JSON
    }
  }

  if (chatId) {
    const chatMemories = await prisma.agentMemory.findMany({
      where: {
        chatId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      take: 20
    })

    for (const memory of chatMemories) {
      try {
        const value = JSON.parse(memory.value)
        context.recentContext.push({
          key: memory.key,
          value,
          confidence: memory.confidence
        })
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return context
}

export function formatMemoryForPrompt(context: MemoryContext): string {
  const sections: string[] = []

  if (Object.keys(context.userProfile).length > 0) {
    sections.push('# User Profile')
    for (const [key, value] of Object.entries(context.userProfile)) {
      sections.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    }
  }

  if (Object.keys(context.preferences).length > 0) {
    sections.push('# Preferences')
    for (const [key, value] of Object.entries(context.preferences)) {
      sections.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    }
  }

  if (context.relevantFacts.length > 0) {
    sections.push('# Relevant Facts')
    for (const fact of context.relevantFacts.slice(0, 10)) {
      sections.push(`- ${fact.key}: ${typeof fact.value === 'object' ? JSON.stringify(fact.value) : fact.value} (confidence: ${fact.confidence.toFixed(2)})`)
    }
  }

  if (context.recentContext.length > 0) {
    sections.push('# Recent Context')
    for (const ctx of context.recentContext.slice(0, 10)) {
      sections.push(`- ${ctx.key}: ${typeof ctx.value === 'object' ? JSON.stringify(ctx.value) : ctx.value}`)
    }
  }

  return sections.join('\n\n')
}

export async function extractMemoriesFromResponse(response: string, chatId?: string): Promise<void> {
  const memoryPatterns = [
    { regex: /user's? name is (\w+)/i, category: 'user_profile', key: 'name' },
    { regex: /user (?:prefers?|likes?) to use (\w+)/i, category: 'preference', key: 'preferred_tool' },
    { regex: /user works (?:as|in) (.+?)(?:\.|,)/i, category: 'user_profile', key: 'occupation' },
    { regex: /user is located in (.+?)(?:\.|,)/i, category: 'user_profile', key: 'location' },
  ]

  for (const pattern of memoryPatterns) {
    const match = response.match(pattern.regex)
    if (match && match[1]) {
      try {
        await prisma.agentMemory.upsert({
          where: { category_key: { category: pattern.category, key: pattern.key } },
          create: {
            category: pattern.category,
            key: pattern.key,
            value: JSON.stringify(match[1]),
            confidence: 0.8,
            source: 'inference',
            chatId: chatId || null
          },
          update: {
            value: JSON.stringify(match[1]),
            confidence: 0.8,
            updatedAt: new Date()
          }
        })
      } catch {
        // Ignore upsert errors
      }
    }
  }
}
