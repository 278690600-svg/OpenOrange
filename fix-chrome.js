const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Fix chrome-devtools-mcp package name
  const chromeServer = await prisma.mcpServer.findFirst({
    where: { name: { contains: 'chrome-devtools-mcp' } }
  });
  
  if (chromeServer) {
    // The correct package is just "chrome-devtools-mcp@latest"
    await prisma.mcpServer.update({
      where: { id: chromeServer.id },
      data: { 
        args: JSON.stringify(['chrome-devtools-mcp@latest'])
      }
    });
    console.log(`Fixed ${chromeServer.name} args to: ["chrome-devtools-mcp@latest"]`);
  }
  
  console.log('Done!');
}

main().finally(() => prisma.$disconnect());
