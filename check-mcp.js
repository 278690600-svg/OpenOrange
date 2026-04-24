const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const servers = await prisma.mcpServer.findMany();
  servers.forEach(s => {
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      command: s.command,
      args: s.args,
      type: s.type,
      enabled: s.enabled
    }, null, 2));
  });
}

main().finally(() => prisma.$disconnect());
