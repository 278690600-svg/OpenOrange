import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const prompts = await prisma.promptTemplate.findMany()
  console.log(JSON.stringify(prompts, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
