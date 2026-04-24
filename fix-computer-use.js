const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Fix computer-use-mcp package name
  const server = await prisma.mcpServer.findFirst({
    where: { name: { contains: 'computer-use-mcp' } }
  });
  
  if (server) {
    // The correct package name is just "computer-use-mcp"
    await prisma.mcpServer.update({
      where: { id: server.id },
      data: { 
        args: JSON.stringify(['-y', 'computer-use-mcp'])
      }
    });
    console.log(`Fixed ${server.name} args to: ["-y","computer-use-mcp"]`);
  }
  
  console.log('Done!');
}

main().finally(() => prisma.$disconnect());
