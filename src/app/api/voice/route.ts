import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { DEFAULT_OLLAMA_URL } from '@/lib/constants'
import { Settings } from '@/lib/ai-provider'

// --- Types ---

interface TranscribeResponse {
  transcript: string
}

interface VoiceCommandResponse {
  action: string
  params: Record<string, unknown>
  confidence: number
}

interface VoiceSettingsResponse {
  providers: string[]
  defaultVoice: string
  defaultSpeed: number
  openaiKeyConfigured: boolean
}

// --- Action: Transcribe (STT via Whisper) ---

async function handleTranscribe(req: NextRequest): Promise<Response> {
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be multipart/form-data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'Missing "audio" file in form data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const settings = await getSettings()
    const apiKey = settings?.openaiKey
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const allowedTypes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/m4a']
    if (!allowedTypes.includes(audioFile.type)) {
      return new Response(
        JSON.stringify({ error: `Unsupported audio format: ${audioFile.type}. Allowed: ${allowedTypes.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer())
    const maxFileSize = 25 * 1024 * 1024 // 25 MB (OpenAI Whisper limit)
    if (buffer.length > maxFileSize) {
      return new Response(
        JSON.stringify({ error: 'Audio file exceeds 25 MB limit' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const form = new FormData()
    const blob = new Blob([buffer], { type: audioFile.type || 'audio/webm' })
    form.append('file', blob, audioFile.name || 'audio.webm')
    form.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[Voice] Whisper API error:', response.status, errorBody)
      return new Response(
        JSON.stringify({ error: `Whisper API error (${response.status}): ${errorBody}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result: TranscribeResponse = await response.json()
    return new Response(
      JSON.stringify({ transcript: result.transcript }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('[Voice] Transcribe error:', error)
    const err = error as Error
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to transcribe audio' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// --- Action: Speak (TTS via OpenAI) ---

async function handleSpeak(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const { text, voice = 'alloy', speed = 1.0 } = body

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "text" field' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (text.length > 4096) {
      return new Response(
        JSON.stringify({ error: 'Text exceeds 4096 character limit' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash']
    if (!validVoices.includes(voice)) {
      return new Response(
        JSON.stringify({ error: `Invalid voice: ${voice}. Allowed: ${validVoices.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (speed < 0.25 || speed > 4.0) {
      return new Response(
        JSON.stringify({ error: 'Speed must be between 0.25 and 4.0' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const settings = await getSettings()
    const apiKey = settings?.openaiKey
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[Voice] TTS API error:', response.status, errorBody)
      return new Response(
        JSON.stringify({ error: `TTS API error (${response.status}): ${errorBody}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const audioBuffer = await response.arrayBuffer()
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: unknown) {
    console.error('[Voice] Speak error:', error)
    const err = error as Error
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to generate speech' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// --- Action: Command (Parse Voice Commands) ---

async function handleCommand(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const { transcript } = body

    if (!transcript || typeof transcript !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "transcript" field' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const command = parseVoiceCommand(transcript)
    return new Response(
      JSON.stringify(command),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('[Voice] Command error:', error)
    const err = error as Error
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to parse command' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Parse natural language transcript into structured voice commands.
 */
function parseVoiceCommand(transcript: string): VoiceCommandResponse {
  const text = transcript.toLowerCase().trim()

  // New chat
  const newChatPatterns = [
    /^(new\s*(chat|conversation|thread))$/i,
    /^(start\s*(a\s*)?(new\s*)?(chat|conversation))$/i,
    /^(创建新对话|新建对话|新对话|开始新对话)$/i,
  ]
  if (newChatPatterns.some(p => p.test(text))) {
    return { action: 'new_chat', params: {}, confidence: 0.95 }
  }

  // Clear / clear chat
  const clearPatterns = [
    /^(clear\s*(chat|conversation|history|screen))$/i,
    /^(清空|清除|清空对话|清空历史|清屏)$/i,
  ]
  if (clearPatterns.some(p => p.test(text))) {
    return { action: 'clear', params: {}, confidence: 0.95 }
  }

  // Search for X
  const searchPatterns = [
    /^search\s*(for|up)?\s+(.+)$/i,
    /^google\s+(.+)$/i,
    /^look\s+up\s+(.+)$/i,
    /^(搜索|搜一下|帮我搜|帮我搜索|查找)\s*(.+)/i,
  ]
  for (const pattern of searchPatterns) {
    const match = text.match(pattern)
    if (match) {
      const query = (match[2] || match[1] || '').trim()
      return { action: 'search', params: { query }, confidence: 0.9 }
    }
  }

  // Send message / say X
  const sendPatterns = [
    /^(?:send|say|tell|message)\s+(.+)$/i,
    /^(发送|说|告诉|发消息)\s*(.+)/i,
  ]
  for (const pattern of sendPatterns) {
    const match = text.match(pattern)
    if (match) {
      const message = (match[1] || '').trim()
      return { action: 'send_message', params: { message }, confidence: 0.85 }
    }
  }

  // Scroll
  const scrollPatterns = [
    /^(scroll\s*(up|down|to\s+top|to\s+bottom|to\s+end))$/i,
    /^(滚动|上滚|下滚|滚到顶部|滚到底部)$/i,
  ]
  if (scrollPatterns.some(p => p.test(text))) {
    const direction = /up|上/.test(text) ? 'up' : 'down'
    return { action: 'scroll', params: { direction }, confidence: 0.9 }
  }

  // Copy / clipboard
  const copyPatterns = [
    /^(copy\s*(last\s*)?(response|message|text|answer))$/i,
    /^(复制|拷贝)(最后)?(回复|消息|回答|文本)/i,
  ]
  if (copyPatterns.some(p => p.test(text))) {
    return { action: 'copy', params: { target: 'last_response' }, confidence: 0.9 }
  }

  // Stop / cancel
  const stopPatterns = [
    /^(stop|cancel|abort|halt)$/i,
    /^(停止|取消|取消发送|中断)$/i,
  ]
  if (stopPatterns.some(p => p.test(text))) {
    return { action: 'stop', params: {}, confidence: 0.95 }
  }

  // Settings
  const settingsPatterns = [
    /^(open\s*)?settings?$/i,
    /^(打开)?设置?$/i,
  ]
  if (settingsPatterns.some(p => p.test(text))) {
    return { action: 'open_settings', params: {}, confidence: 0.9 }
  }

  // Toggle dark mode
  const darkModePatterns = [
    /^(toggle|switch|change)\s*(to\s*)?(dark|light)\s*(mode)?$/i,
    /^(切换)?(深色|暗色|黑暗|白天|白天模式|夜间模式|夜间|暗黑)模式?$/i,
  ]
  for (const pattern of darkModePatterns) {
    const match = text.match(pattern)
    if (match) {
      const mode = /dark|深色|暗色|黑暗|夜间|暗黑/.test(text) ? 'dark' : 'light'
      return { action: 'toggle_theme', params: { mode }, confidence: 0.85 }
    }
  }

  // Regenerate
  const regeneratePatterns = [
    /^(regenerate|retry|try again|redo|rewrite)$/i,
    /^(重新生成|重写|重试|再试一次|重新回答)$/i,
  ]
  if (regeneratePatterns.some(p => p.test(text))) {
    return { action: 'regenerate', params: {}, confidence: 0.9 }
  }

  // Fallback: treat as regular text input
  return { action: 'text_input', params: { text: transcript }, confidence: 0.5 }
}

// --- Action: Settings ---

async function handleSettings(): Promise<Response> {
  try {
    const settings = await getSettings()
    const openaiKeyConfigured = !!settings?.openaiKey

    const response: VoiceSettingsResponse = {
      providers: openaiKeyConfigured
        ? ['openai-stt', 'openai-tts']
        : [],
      defaultVoice: 'alloy',
      defaultSpeed: 1.0,
      openaiKeyConfigured,
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('[Voice] Settings error:', error)
    const err = error as Error
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to get settings' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// --- Settings Cache (reused from chat/route.ts pattern) ---

type SettingsData = {
  openaiKey?: string
  ollamaUrl?: string
  defaultModel?: string
  [key: string]: unknown
}

let settingsCache: { data: SettingsData | null; timestamp: number } | null = null
const SETTINGS_CACHE_TTL = 30_000

async function getSettings() {
  const now = Date.now()
  if (settingsCache && now - settingsCache.timestamp < SETTINGS_CACHE_TTL) {
    return settingsCache.data
  }
  const data = await prisma.settings.findUnique({ where: { id: 'default' } }) as SettingsData | null
  settingsCache = { data, timestamp: now }
  return data
}

// --- Main Route Handler ---

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  switch (action) {
    case 'transcribe':
      return handleTranscribe(req)
    case 'speak':
      return handleSpeak(req)
    case 'command':
      return handleCommand(req)
    default:
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Valid actions: transcribe, speak, command` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  switch (action) {
    case 'settings':
      return handleSettings()
    default:
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Valid actions: settings` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export const maxBodyLength = 26214400 // 25 MB for audio uploads
