import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const id = 'aae7b'
  console.log('Attempting to delete id:', id)
  // Use plain $executeRaw without 'as any' for JS
  const result = await prisma.$executeRaw`
    DELETE FROM "PromptTemplate" WHERE id = ${id} AND "isSystem" = 0
  `
  console.log('Result (number of rows deleted):', result)
  
  // Verify if it's still there
  const remains = await prisma.promptTemplate.findUnique({ where: { id } })
  console.log('Record still exists?', !!remains)
}
main().catch(console.error).finally(() => prisma.$disconnect())
