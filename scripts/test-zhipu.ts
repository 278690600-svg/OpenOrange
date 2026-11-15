import { PrismaClient } from '@prisma/client'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  if (!settings || !settings.zhipuKey) {
    console.log('No zhipuKey found in database')
    return
  }

  console.log('Testing Zhipu with API Key length:', settings.zhipuKey.length)

  const zhipuProvider = createOpenAI({ 
    apiKey: settings.zhipuKey, 
    baseURL: 'https://open.bigmodel.cn/api/paas/v4' 
  })

  // GLM-5.2? Note: If it doesn't exist on server, the server will error
  const modelId = 'glm-4' // We will try glm-4 first, then glm-5.2 or glm-5 if requested
  
  try {
    const { text } = await generateText({
      model: zhipuProvider.chat('glm-5.2'),
      prompt: '你好，请告诉我你的名字',
    })
    console.log('Success (glm-5.2):', text)
  } catch (e: any) {
    console.error('Error with glm-5.2:', e.message || e)
  }

  try {
    const { text } = await generateText({
      model: zhipuProvider.chat('glm-4'),
      prompt: '你好，请告诉我你的名字',
    })
    console.log('Success (glm-4):', text)
  } catch (e: any) {
    console.error('Error with glm-4:', e.message || e)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
