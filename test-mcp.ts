
import { mcpManager } from './src/lib/mcp';

async function test() {
  console.log("Testing McpManager.getAllServers()...");
  try {
    const servers = await mcpManager.getAllServers();
    console.log("Servers found:", JSON.stringify(servers, null, 2));
    
    const computerUse = servers.find(s => s.name === 'computer-use');
    if (computerUse && computerUse.source === 'config') {
      console.log("✅ Successfully loaded config-based server: computer-use");
    } else {
      console.log("❌ Failed to find computer-use server or source is incorrect");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
