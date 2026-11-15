import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const startTime = Date.now()
  try {
    const body = await req.json()
    const { provider, key, url } = body

    if (provider === "ollama") {
      const ollamaUrl = url || "http://localhost:11434"
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), 2000)
      
      try {
        const res = await fetch(`${ollamaUrl}/api/tags`, {
          signal: controller.signal,
          cache: "no-store",
        })
        clearTimeout(id)
        if (res.ok) {
          return NextResponse.json({ ok: true, latency: Date.now() - startTime })
        }
      } catch (err) {
        // Fallback to checking root Url
        try {
          const resRoot = await fetch(ollamaUrl, {
            signal: controller.signal,
            cache: "no-store",
          })
          clearTimeout(id)
          return NextResponse.json({ ok: true, latency: Date.now() - startTime })
        } catch (e) {}
      }
      return NextResponse.json({ ok: false, error: "Ollama offline or refused connection" }, { status: 400 })
    }

    if (provider === "lmstudio") {
      const lmstudioUrl = url || "http://localhost:1234"
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), 2000)
      try {
        const res = await fetch(`${lmstudioUrl}/v1/models`, {
          signal: controller.signal,
          cache: "no-store",
        })
        clearTimeout(id)
        if (res.ok) {
          return NextResponse.json({ ok: true, latency: Date.now() - startTime })
        }
      } catch (err) {}
      return NextResponse.json({ ok: false, error: "LM Studio offline or refused connection" }, { status: 400 })
    }

    // Cloud Providers
    if (!key) {
      return NextResponse.json({ ok: false, error: "API Key is empty" }, { status: 400 })
    }

    let testUrl = ""
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 3000) // 3 seconds timeout for cloud APIs

    if (provider === "openai" || provider === "deepseek" || provider === "groq" || provider === "mistral" || provider === "openrouter" || provider === "nvidia" || provider === "volcengine") {
      let baseUrl = "https://api.openai.com/v1"
      if (provider === "deepseek") baseUrl = "https://api.deepseek.com"
      if (provider === "groq") baseUrl = "https://api.groq.com/openai/v1"
      if (provider === "mistral") baseUrl = "https://api.mistral.ai/v1"
      if (provider === "openrouter") baseUrl = "https://openrouter.ai/api/v1"
      if (provider === "nvidia") baseUrl = "https://integrate.api.nvidia.com/v1"
      if (provider === "volcengine") baseUrl = "https://ark.cn-beijing.volces.com/api/coding/v3"
      
      // Override if user defined custom ApiBase (only for OpenAI)
      if (provider === "openai" && url) {
        baseUrl = url
      }

      // Strip trailing slash if present
      if (baseUrl.endsWith("/")) {
        baseUrl = baseUrl.slice(0, -1)
      }

      testUrl = `${baseUrl}/models`
      headers["Authorization"] = `Bearer ${key}`
    } else if (provider === "anthropic") {
      testUrl = "https://api.anthropic.com/v1/models"
      headers["x-api-key"] = key
      headers["anthropic-version"] = "2023-06-01"
    } else if (provider === "google") {
      testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    } else if (provider === "zhipu") {
      testUrl = "https://open.bigmodel.cn/api/paas/v4/models"
      headers["Authorization"] = `Bearer ${key}`
    } else if (provider === "lingyi") {
      testUrl = "https://api.lingyiwanwu.com/v1/models"
      headers["Authorization"] = `Bearer ${key}`
    } else if (provider === "minimax") {
      testUrl = "https://api.minimax.chat/v1/models"
      headers["Authorization"] = `Bearer ${key}`
    } else {
      return NextResponse.json({ ok: false, error: `Unsupported provider: ${provider}` }, { status: 400 })
    }

    try {
      const res = await fetch(testUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store"
      })
      clearTimeout(id)

      if (res.ok) {
        return NextResponse.json({ ok: true, latency: Date.now() - startTime })
      } else {
        const text = await res.text().catch(() => "")
        let errorMsg = `HTTP ${res.status}`
        if (res.status === 401) {
          errorMsg = "Unauthorized: Invalid API Key"
        } else if (res.status === 403) {
          errorMsg = "Forbidden: Access denied"
        }
        return NextResponse.json({ ok: false, error: errorMsg, details: text.slice(0, 100) }, { status: res.status })
      }
    } catch (e: any) {
      clearTimeout(id)
      return NextResponse.json({ ok: false, error: e.name === "AbortError" ? "Request Timeout" : e.message }, { status: 504 })
    }

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
