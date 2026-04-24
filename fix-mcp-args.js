const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const servers = await prisma.mcpServer.findMany();
  
  for (const server of servers) {
    let args = server.args;
    
    // Try to parse and fix double-encoded JSON
    try {
      // First parse
      let parsed = JSON.parse(args);
      
      // If it's still a string, parse again (double-encoded)
      while (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      
      // If it's an object with mcpServers key, extract the actual args
      if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
        const serverKey = Object.keys(parsed.mcpServers)[0];
        parsed = parsed.mcpServers[serverKey].args || [];
      }
      
      // Ensure it's an array
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }
      
      // Save the fixed args
      await prisma.mcpServer.update({
        where: { id: server.id },
        data: { args: JSON.stringify(parsed) }
      });
      
      console.log(`Fixed ${server.name}: ${JSON.stringify(parsed)}`);
    } catch (e) {
      console.log(`Could not fix ${server.name}: ${e.message}`);
    }
  }
  
  console.log('\nAll servers fixed!');
}

main().finally(() => prisma.$disconnect());
