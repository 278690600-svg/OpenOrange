import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  if (!settings) return

  const key = settings.volcengineKey as string || ''
  if (!key) {
    console.log('No key')
    return
  }

  const endpoint = "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"

  console.log('--- Calling Volcengine API in Streaming Mode ---')
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'glm-5.2',
      messages: [{ role: 'user', content: '你好，回复你好。' }],
      stream: true
    })
  })

  console.log('Status:', response.status, response.statusText)
  if (!response.body) {
    console.log('No body returned')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    console.log('--- SSE CHUNK ---')
    console.log(chunk)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
