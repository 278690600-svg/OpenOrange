import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  if (!settings || !settings.volcengineKey) {
    console.log('No volcengineKey found in database')
    return
  }

  console.log('Testing Volcengine with API Key length:', settings.volcengineKey.length)

  const fetchModel = async (modelName: string) => {
    try {
      const res = await fetch('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.volcengineKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: '你好，请测试一下' }]
        })
      })
      
      const status = res.status
      const text = await res.text()
      console.log(`[${modelName}] Status: ${status}`)
      console.log(`[${modelName}] Response: ${text.substring(0, 300)}`)
    } catch (e: any) {
      console.error(`[${modelName}] Error:`, e.message)
    }
  }

  await fetchModel('glm-5.2')
  await fetchModel('deepseek-v4-flash')
  await fetchModel('doubao-seed-2.0-code')
}

main().catch(console.error).finally(() => prisma.$disconnect())
