import { NextResponse } from 'next/server'
import { getTaskScheduler } from '@/lib/task-scheduler'
import prisma from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  try {
    const task = await prisma.inferenceTask.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, chatId: true, model: true, provider: true, error: true, result: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const scheduler = getTaskScheduler()
    const liveStatus = scheduler.getTaskStatus(taskId)

    return NextResponse.json({
      ...task,
      liveStatus: liveStatus || task.status,
    })
  } catch (error: unknown) {
    console.error('[Task GET API] Error:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to get task' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, model, chatId, deepThink, webSearch, kbId, files, promptId, docType, docStyle, docTheme } = body

    if (!model) {
      return NextResponse.json({ error: 'Model is required' }, { status: 400 })
    }

    const { parseModelId, getProviderInfo } = await import('@/lib/model-adapter')
    const { provider: providerType } = parseModelId(model)
    const providerInfo = getProviderInfo(providerType)

    const { v4: uuidv4 } = await import('uuid')
    const taskId = uuidv4()

    // chatId 为临时ID时使用空字符串，避免外键约束冲突
    const isTempChatId = !chatId || chatId === 'new' || chatId.startsWith('new-')
    const dbChatId = isTempChatId ? '' : chatId

    await prisma.inferenceTask.create({
      data: {
        id: taskId,
        chatId: dbChatId,
        model,
        provider: providerType,
        status: 'queued',
        input: JSON.stringify({ messages, deepThink, webSearch, kbId, files, promptId, docType, docStyle, docTheme }),
      }
    })

    const scheduler = getTaskScheduler()
    console.log(`[Task] Creating task ${taskId}, scheduler instance=${scheduler.instanceId}, model=${model}, chatId=${chatId}`)
    scheduler.enqueue({
      taskId,
      chatId: chatId || `new-${Date.now()}`,
      model,
      messages: messages || [],
      deepThink,
      webSearch,
      kbId,
      files,
      promptId,
      docType,
      docStyle,
      docTheme,
    })

    return NextResponse.json({
      taskId,
      status: 'queued',
      provider: providerType,
      providerName: providerInfo.name,
    })
  } catch (error: unknown) {
    console.error('[Task API] Error:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to create task' }, { status: 500 })
  }
}
