import { getTaskScheduler } from '@/lib/task-scheduler'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface ActiveTaskInput {
  input: { model: string; chatId: string }
}

export async function GET() {
  const scheduler = getTaskScheduler()

  const activeTasks = Array.from((scheduler as unknown as { activeTasks: Map<string, ActiveTaskInput> }).activeTasks.entries()).map(([id, val]) => ({
    taskId: id,
    model: val.input.model,
    chatId: val.input.chatId,
    status: 'running' as const,
  }))

  const queuedTasks = scheduler.getQueueTasks().map(t => ({
    taskId: t.taskId,
    model: t.model,
    chatId: t.chatId,
    status: 'queued' as const,
  }))

  const dbActiveTasks = await prisma.inferenceTask.findMany({
    where: { status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return Response.json({
    active: activeTasks,
    queued: queuedTasks,
    dbActive: dbActiveTasks.map(t => ({
      taskId: t.id,
      model: t.model,
      chatId: t.chatId,
      status: t.status,
      provider: t.provider,
      createdAt: t.createdAt,
    })),
    stats: {
      activeCount: activeTasks.length,
      queuedCount: queuedTasks.length,
      dbActiveCount: dbActiveTasks.length,
    },
  })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const action = searchParams.get('action')

  if (action === 'clear-all') {
    const scheduler = getTaskScheduler()
    scheduler.cancelAllTasks()

    await prisma.inferenceTask.updateMany({
      where: { status: { in: ['queued', 'running'] } },
      data: { status: 'cancelled', completedAt: new Date() },
    })

    return Response.json({ success: true, message: 'All tasks cleared' })
  }

  if (taskId) {
    const scheduler = getTaskScheduler()
    scheduler.cancelTask(taskId)

    await prisma.inferenceTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', completedAt: new Date() },
    }).catch(() => {})

    return Response.json({ success: true, message: `Task ${taskId} cancelled` })
  }

  return Response.json({ error: 'Provide taskId or action=clear-all' }, { status: 400 })
}
