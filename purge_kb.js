const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const kb = await prisma.knowledgeBase.findFirst({
    where: { name: 'MySQL_PDCA' }
  });

  if (!kb) {
    console.log('Knowledge base MySQL_PDCA not found');
    return;
  }

  console.log(`Purging chunks for KB: ${kb.id} (${kb.name})...`);
  const { count } = await prisma.knowledgeChunk.deleteMany({
    where: { knowledgeBaseId: kb.id }
  });
  
  console.log(`Deleted ${count} chunks.`);

  console.log('Setting status to indexing to trigger clean update...');
  await prisma.knowledgeBase.update({
    where: { id: kb.id },
    data: { status: 'indexing', lastError: '' }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
