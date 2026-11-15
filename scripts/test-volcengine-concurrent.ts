import { PrismaClient } from '@prisma/client'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  if (!settings) return

  const key = settings.volcengineKey as string || ''
  if (!key) {
    console.log('No volcengineKey in DB')
    return
  }

  console.log('--- Starting Concurrent Test ---')
  console.log('API Key length:', key.length)

  const provider = createOpenAI({
    apiKey: key,
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    fetch: async (url, options) => {
      const opt = options || {}
      if (opt.body && typeof opt.body === 'string') {
        try {
          const parsed = JSON.parse(opt.body)
          delete parsed.stream_options
          opt.body = JSON.stringify(parsed)
        } catch {}
      }
      return fetch(url, opt)
    }
  })

  // 1. Launch Task A (glm-5.2) with a long prompt to keep it streaming
  console.log('\n[Task A] Starting...')
  const resultA = streamText({
    model: provider.chat('glm-5.2'),
    messages: [{ role: 'user', content: '请详细介绍一下3D模型渲染器的发展历史和主要技术，生成至少1000字。' }],
    temperature: 0.7,
    maxRetries: 0,
  })
  
  let taskACompleted = false
  let taskAError = null
  let taskAChars = 0

  const runTaskA = async () => {
    try {
      for await (const chunk of resultA.textStream) {
        taskAChars += chunk.length
        process.stdout.write(`[A:${chunk.length}] `)
      }
      taskACompleted = true
      console.log('\n[Task A] Successfully completed stream!')
    } catch (e: any) {
      taskAError = e
      console.error('\n❌ [Task A] Stream disconnected with error:', e.message || e)
    }
  }

  // Start reading Task A in the background
  const promiseA = runTaskA()

  // 2. Wait 2 seconds, then launch Task B (glm-5.2)
  console.log('\nWaiting 2 seconds before launching Task B...')
  await new Promise(resolve => setTimeout(resolve, 2000))

  console.log('\n[Task B] Starting concurrent task...')
  let taskBCompleted = false
  let taskBError = null

  try {
    const resultB = streamText({
      model: provider.chat('glm-5.2'),
      messages: [{ role: 'user', content: '你好，请简单回复“收到”。' }],
      temperature: 0.7,
      maxRetries: 0,
    })
    for await (const chunk of resultB.textStream) {
      process.stdout.write(`[B:${chunk.length}] `)
    }
    taskBCompleted = true
    console.log('\n[Task B] Successfully completed stream!')
  } catch (e: any) {
    taskBError = e
    console.error('\n❌ [Task B] Stream disconnected with error:', e.message || e)
  }

  // Wait for Task A to finish
  await promiseA

  console.log('\n--- Concurrent Test Results ---')
  console.log('Task A status:', taskACompleted ? 'SUCCESS' : 'FAILED', `chars: ${taskAChars}`)
  if (taskAError) console.log('Task A Error details:', taskAError)
  console.log('Task B status:', taskBCompleted ? 'SUCCESS' : 'FAILED')
  if (taskBError) console.log('Task B Error details:', taskBError)
}

main().catch(console.error).finally(() => prisma.$disconnect())
