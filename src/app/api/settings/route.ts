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
          minimaxKey: "",
          deepseekKey: "",
          openrouterKey: "",
          defaultModel: "ollama::llama3",
          searchEngine: "duckduckgo",
          searchKey: "",
          embeddingModel: "text-embedding-3-small",
          hybridSearchEnabled: true,
        }
      })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error("Settings GET Error:", error)
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
        minimaxKey: data.minimaxKey,
        deepseekKey: data.deepseekKey,
        openrouterKey: data.openrouterKey,
        defaultModel: data.defaultModel,
        searchEngine: data.searchEngine,
        searchKey: data.searchKey,
        embeddingModel: data.embeddingModel,
        hybridSearchEnabled: data.hybridSearchEnabled,
      },
      create: {
        id: "default",
        ollamaUrl: data.ollamaUrl || "http://127.0.0.1:11434",
        lmstudioUrl: data.lmstudioUrl || "http://127.0.0.1:1234",
        openaiKey: data.openaiKey || "",
        minimaxKey: data.minimaxKey || "",
        deepseekKey: data.deepseekKey || "",
        openrouterKey: data.openrouterKey || "",
        defaultModel: data.defaultModel || "ollama::llama3",
        searchEngine: data.searchEngine || "duckduckgo",
        searchKey: data.searchKey || "",
        embeddingModel: data.embeddingModel || "text-embedding-3-small",
        hybridSearchEnabled: data.hybridSearchEnabled ?? true,
      }
    })
    return NextResponse.json(settings)
  } catch (error) {
    console.error("Settings POST Error:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
