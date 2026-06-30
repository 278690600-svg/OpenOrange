import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    let settings = await prisma.settings.findUnique({ where: { id: "default" } })
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          id: "default",
          ollamaUrl: "http://127.0.0.1:11434",
          lmstudioUrl: "http://127.0.0.1:1234",
          openaiKey: "",
          anthropicKey: "",
          googleKey: "",
          deepseekKey: "",
          minimaxKey: "",
          groqKey: "",
          mistralKey: "",
          zhipuKey: "",
          lingyiKey: "",
          openrouterKey: "",
          nvidiaKey: "",
          defaultModel: "ollama::llama3",
          searchEngine: "duckduckgo",
          searchKey: "",
          embeddingModel: "text-embedding-3-small",
          hybridSearchEnabled: true,
          mcpEnabled: true,
          mcpAutoLoad: false,
          enabledModels: "[]",
          theme: "zinc",
          maxConcurrentChats: 3,
        }
      })
    }

    // Fallback: Fetch fields that might be missing from an out-of-sync Prisma Client
    try {
      const rawRes: any = await (prisma as any).$queryRawUnsafe(`SELECT "nvidiaKey", "enabledModels" FROM "Settings" WHERE id = 'default'`)
      if (rawRes && rawRes[0]) {
        (settings as any).nvidiaKey = rawRes[0].nvidiaKey ?? (settings as any).nvidiaKey;
        (settings as any).enabledModels = rawRes[0].enabledModels ?? (settings as any).enabledModels;
      }
    } catch (e) {
      // Silently handle missing columns
    }

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        ollamaUrl: data.ollamaUrl,
        lmstudioUrl: data.lmstudioUrl,
        openaiKey: data.openaiKey,
        anthropicKey: data.anthropicKey,
        googleKey: data.googleKey,
        deepseekKey: data.deepseekKey,
        minimaxKey: data.minimaxKey,
        groqKey: data.groqKey,
        mistralKey: data.mistralKey,
        zhipuKey: data.zhipuKey,
        lingyiKey: data.lingyiKey,
        openrouterKey: data.openrouterKey,
        defaultModel: data.defaultModel,
        searchEngine: data.searchEngine,
        searchKey: data.searchKey,
        embeddingModel: data.embeddingModel,
        hybridSearchEnabled: data.hybridSearchEnabled,
        localGgufEnabled: data.localGgufEnabled,
        localGgufContextSize: data.localGgufContextSize,
        localGgufTemperature: data.localGgufTemperature,
        localGgufTopP: data.localGgufTopP,
        localGgufRepeatPenalty: data.localGgufRepeatPenalty,
        localGgufMaxTokens: data.localGgufMaxTokens,
        apiTemperature: data.apiTemperature,
        apiTopP: data.apiTopP,
        apiMaxTokens: data.apiMaxTokens,
        apiContextSize: data.apiContextSize,
        theme: data.theme,
        mcpEnabled: data.mcpEnabled,
        mcpAutoLoad: data.mcpAutoLoad,
        maxConcurrentChats: data.maxConcurrentChats ?? 3,
      } as any,
      create: {
        id: "default",
        ollamaUrl: data.ollamaUrl || "http://127.0.0.1:11434",
        lmstudioUrl: data.lmstudioUrl || "http://127.0.0.1:1234",
        openaiKey: data.openaiKey || "",
        anthropicKey: data.anthropicKey || "",
        googleKey: data.googleKey || "",
        deepseekKey: data.deepseekKey || "",
        minimaxKey: data.minimaxKey || "",
        groqKey: data.groqKey || "",
        mistralKey: data.mistralKey || "",
        zhipuKey: data.zhipuKey || "",
        lingyiKey: data.lingyiKey || "",
        openrouterKey: data.openrouterKey || "",
        defaultModel: data.defaultModel || "ollama::llama3",
        searchEngine: data.searchEngine || "duckduckgo",
        searchKey: data.searchKey || "",
        embeddingModel: data.embeddingModel || "text-embedding-3-small",
        hybridSearchEnabled: data.hybridSearchEnabled ?? true,
        localGgufEnabled: data.localGgufEnabled ?? false,
        localGgufContextSize: data.localGgufContextSize ?? 4096,
        localGgufTemperature: data.localGgufTemperature ?? 0.7,
        localGgufTopP: data.localGgufTopP ?? 0.95,
        localGgufRepeatPenalty: data.localGgufRepeatPenalty ?? 1.1,
        localGgufMaxTokens: data.localGgufMaxTokens ?? 1024,
        apiTemperature: data.apiTemperature ?? 0.7,
        apiTopP: data.apiTopP ?? 0.9,
        apiMaxTokens: data.apiMaxTokens ?? 2048,
        apiContextSize: data.apiContextSize ?? 8192,
        theme: data.theme || "zinc",
        mcpEnabled: data.mcpEnabled ?? true,
        mcpAutoLoad: data.mcpAutoLoad ?? false,
        maxConcurrentChats: data.maxConcurrentChats ?? 3,
      } as any,
    })

    // Fallback: Manually update fields that might be missing from an out-of-sync Prisma Client
    try {
      await (prisma as any).$executeRawUnsafe(`
        UPDATE "Settings" 
        SET "nvidiaKey" = ?, "enabledModels" = ?
        WHERE "id" = 'default'
      `, data.nvidiaKey || "", data.enabledModels || "[]")
    } catch (e) {
      console.warn("Raw SQL update failed (expected if columns don't exist yet):", e)
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("Settings POST Error:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
