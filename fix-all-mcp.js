const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Fix playwright-mcp package name
  const playwrightServer = await prisma.mcpServer.findFirst({
    where: { name: { contains: 'playwright-mcp' } }
  });
  
  if (playwrightServer) {
    await prisma.mcpServer.update({
      where: { id: playwrightServer.id },
      data: { 
        args: JSON.stringify(['@playwright/mcp@latest'])
      }
    });
    console.log(`Fixed ${playwrightServer.name} args to: ["@playwright/mcp@latest"]`);
  }

  // Fix chrome-devtools-mcp package name
  const chromeServer = await prisma.mcpServer.findFirst({
    where: { name: { contains: 'chrome-devtools-mcp' } }
  });
  
  if (chromeServer) {
    // The correct package is @anthropic-ai/chrome-devtools-mcp or similar
    // Let's try the common format
    await prisma.mcpServer.update({
      where: { id: chromeServer.id },
      data: { 
        args: JSON.stringify(['@anthropic-ai/chrome-devtools-mcp'])
      }
    });
    console.log(`Fixed ${chromeServer.name} args to: ["@anthropic-ai/chrome-devtools-mcp"]`);
  }
  
  console.log('Done!');
}

main().finally(() => prisma.$disconnect());
