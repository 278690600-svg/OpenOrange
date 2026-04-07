import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const kbs = await prisma.knowledgeBase.findMany({
    include: { _count: { select: { chunks: true } } }
  })
  console.log('Knowledge Bases:', JSON.stringify(kbs, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
