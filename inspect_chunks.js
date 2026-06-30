const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const kbs = await prisma.knowledgeBase.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('--- Knowledge Bases ---');
  for (const kb of kbs) {
    const chunkCount = await prisma.knowledgeChunk.count({ where: { knowledgeBaseId: kb.id } });
    console.log(`ID: ${kb.id} | Name: ${kb.name} | Type: ${kb.sourceType} | Chunks: ${chunkCount}`);
    
    if (chunkCount > 0) {
      const sampleChunks = await prisma.knowledgeChunk.findMany({
        where: { knowledgeBaseId: kb.id },
        take: 3,
        select: { title: true, sourceUri: true, content: true }
      });
      console.log('  Samples:');
      sampleChunks.forEach(c => {
        console.log(`  - ${c.title} (${c.sourceUri})`);
        console.log(`    Content length: ${c.content.length}`);
        console.log(`    Content prefix: ${c.content.substring(0, 100).replace(/\n/g, ' ')}`);
      });
    }
    console.log('');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
