import { getTaskScheduler, prismaRetry } from '../src/lib/task-scheduler'
import prisma from '../src/lib/db'

async function main() {
  console.log('--- 开始测试搜索词提取与并发性能 ---')
  const scheduler = getTaskScheduler() as any

  // 1. 测试搜索关键词提取
  console.log('\n--- 1. 测试搜索意图与关键词提炼 ---')
  const testQueries = [
    '我想查一下苹果公司最近几天发布的iPhone 16新产品，顺便帮我搜一下国内是什么时候开始卖的',
    '谁是现任的联合国秘书长？能帮我查查他的个人资料 and 背景吗？还有他最近去了哪',
    '请问2026年现在的黄金价格是多少？今日金价走势如何？',
    '你好，我想知道现在的DeepSeek-v3模型和OpenAI o1模型有什么具体的评测对比，哪个写代码更好用',
  ]

  for (const q of testQueries) {
    console.log(`\n原始提问: "${q}"`)
    try {
      const start = Date.now()
      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      if (!settings) {
        console.warn('警告: 未找到 default 设置，请确保数据库中已配置。')
        continue
      }
      
      const model = 'doubao-seed-2.0-pro' 
      const providerType = 'volcengine'
      const config = {
        apiKey: settings.volcengineKey,
        baseUrl: settings.openaiApiBase || 'https://ark.cn-beijing.volces.com/api/coding/v3'
      }

      // 通过反射调用 private generateSearchQuery
      const rewritten = await scheduler.generateSearchQuery(q, [], providerType, config, model)
      console.log(`提炼出的关键词: "${rewritten}" (耗时: ${Date.now() - start}ms)`)
    } catch (e: any) {
      console.error('提炼失败:', e.message)
    }
  }

  // 2. 测试并发写操作 (SQLite 并发测试)
  console.log('\n--- 2. 测试 Prisma 并发锁定退避重试 (prismaRetry) ---')
  const testPrismaRetry = async (id: string) => {
    try {
      console.log(`[Task-${id}] 发起写操作...`)
      
      const runQuery = async () => {
        return await prisma.inferenceTask.upsert({
          where: { id: `test-task-${id}` },
          create: {
            id: `test-task-${id}`,
            chatId: `test-chat-${id}`,
            model: 'doubao-seed-2.0-pro',
            status: 'running',
            startedAt: new Date()
          },
          update: {
            status: 'running',
            startedAt: new Date()
          }
        })
      }
      
      const res = await prismaRetry(runQuery)
      console.log(`[Task-${id}] 写操作成功！任务状态为: ${res.status}`)
    } catch (e: any) {
      console.error(`[Task-${id}] 异常崩溃:`, e.message)
    }
  };

  console.log('发起 15 个并发写操作，观察是否会有锁定退避重试，以及是否都能顺利成功...')
  const promises = Array.from({ length: 15 }).map((_, i) => testPrismaRetry(String(i)))
  await Promise.all(promises)
  
  // 清理测试用的 task
  console.log('清理测试数据...')
  for (let i = 0; i < 15; i++) {
    await prisma.inferenceTask.delete({ where: { id: `test-task-${i}` } }).catch(() => {})
  }
  
  console.log('\n并发写与意图提炼测试全部结束。')
}

main().catch(console.error).finally(() => prisma.$disconnect())
