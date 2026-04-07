import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const server = await prisma.mcpServer.upsert({
    where: { id: 'remote-example' },
    update: {
      name: 'GitHub MCP (SSE)',
      type: 'sse',
      url: 'http://localhost:3001/sse', // Placeholder URL
      enabled: true,
    },
    create: {
      id: 'remote-example',
      name: 'GitHub MCP (SSE)',
      type: 'sse',
      url: 'http://localhost:3001/sse', // Placeholder URL
      enabled: true,
    },
  })
  console.log('Remote MCP server added:', server)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
