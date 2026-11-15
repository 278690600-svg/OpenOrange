import { getTaskScheduler } from '@/lib/task-scheduler'
import { sseEvent } from '@/lib/ai-provider'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    return new Response(JSON.stringify({ error: 'taskId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const scheduler = getTaskScheduler()
  console.log(`[Stream] SSE connection for task ${taskId}, scheduler instance=${scheduler.instanceId}`)

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  let isClosed = false

  let writeQueue: Promise<void> = Promise.resolve()

  const enqueueWrite = (data: string): Promise<void> => {
    if (isClosed) return Promise.resolve()
    writeQueue = writeQueue.then(async () => {
      if (isClosed) return
      try {
        await writer.write(encoder.encode(data))
      } catch {
        isClosed = true
      }
    })
    return writeQueue
  }

  const close = async () => {
    if (isClosed) return
    isClosed = true
    await writeQueue.catch(() => {})
    try { await writer.close() } catch {}
  }

  const heartbeatInterval = setInterval(() => {
    enqueueWrite(sseEvent('heartbeat', {}))
  }, 8000)

  let unsubscribe: (() => void) | null = null

  const cleanup = () => {
    clearInterval(heartbeatInterval)
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  const isTerminalStatus = (s: string | null): s is 'completed' | 'failed' | 'cancelled' =>
    s === 'completed' || s === 'failed' || s === 'cancelled'

  const currentStatus = scheduler.getTaskStatus(taskId)
  const taskInfo = scheduler.getTaskInfo(taskId)
  const bufferedEvents = scheduler.getBufferedEvents(taskId)
  console.log(`[Stream] Task ${taskId} status: ${currentStatus}, hasInfo: ${!!taskInfo}, bufferedEvents: ${bufferedEvents.length}`)

  if (isTerminalStatus(currentStatus)) {
    console.log(`[Stream] Task ${taskId} is terminal: ${currentStatus}`)
    clearInterval(heartbeatInterval)

    if (bufferedEvents.length > 0) {
      for (const { event, data } of bufferedEvents) {
        if (isClosed) break
        enqueueWrite(sseEvent(event, data))
      }
    } else {
      const events: string[] = []
      if (currentStatus === 'completed' && taskInfo) {
        if (taskInfo.chatId && taskInfo.originalChatId && taskInfo.chatId !== taskInfo.originalChatId) {
          events.push(sseEvent('chatId', { id: taskInfo.chatId, oldId: taskInfo.originalChatId }))
        } else if (taskInfo.chatId) {
          events.push(sseEvent('chatId', { id: taskInfo.chatId, oldId: '' }))
        }
        if (taskInfo.accumulatedText) {
          events.push(sseEvent('text', { content: taskInfo.accumulatedText, replace: true }))
        }
        events.push(sseEvent('done', { textLength: taskInfo.accumulatedText?.length || 0, chatId: taskInfo.chatId }))
      } else if (currentStatus === 'completed') {
        try {
          const prisma = (await import('@/lib/db')).default
          const dbTask = await prisma.inferenceTask.findUnique({ where: { id: taskId } })
          if (dbTask) {
            if (dbTask.chatId) events.push(sseEvent('chatId', { id: dbTask.chatId, oldId: '' }))
            if (dbTask.result) events.push(sseEvent('text', { content: dbTask.result, replace: true }))
            events.push(sseEvent('done', { textLength: dbTask.result?.length || 0, chatId: dbTask.chatId }))
          } else {
            events.push(sseEvent('task_error', { message: '任务未找到' }))
          }
        } catch {
          events.push(sseEvent('task_error', { message: '任务查询失败' }))
        }
      } else if (currentStatus === 'failed') {
        let errorMsg = '任务失败'
        if (!taskInfo) {
          try {
            const prisma = (await import('@/lib/db')).default
            const dbTask = await prisma.inferenceTask.findUnique({ where: { id: taskId } })
            if (dbTask?.error) errorMsg = dbTask.error
          } catch {}
        }
        events.push(sseEvent('task_error', { message: errorMsg }))
      } else if (currentStatus === 'cancelled') {
        events.push(sseEvent('status', { type: 'task', stage: 'cancelled', message: '任务已取消' }))
      }

      for (const evt of events) {
        if (isClosed) break
        enqueueWrite(evt)
      }
    }

    await writeQueue.catch(() => {})
    await close()
    return new Response(stream.readable, { headers: sseHeaders })
  }

  const freshBuffered = scheduler.getBufferedEvents(taskId)
  const replayedEventCounts = new Map<string, number>()

  if (freshBuffered.length > 0) {
    console.log(`[Stream] Replaying ${freshBuffered.length} buffered events for ${taskId}`)
    for (const { event, data } of freshBuffered) {
      if (isClosed) break
      const eventId = `${event}:${JSON.stringify(data)}`
      replayedEventCounts.set(eventId, (replayedEventCounts.get(eventId) || 0) + 1)
      enqueueWrite(sseEvent(event, data))
    }
  }

  unsubscribe = scheduler.subscribe(taskId, async (event, data) => {
    const eventId = `${event}:${JSON.stringify(data)}`
    const count = replayedEventCounts.get(eventId) || 0
    if (count > 0) {
      if (count === 1) replayedEventCounts.delete(eventId)
      else replayedEventCounts.set(eventId, count - 1)
      return
    }
    console.log(`[Stream] Subscriber callback for ${taskId}, event=${event}`)
    await enqueueWrite(sseEvent(event, data))
    if (event === 'done' || event === 'task_error' || event === 'error' || (event === 'status' && (data as Record<string, unknown>)?.stage === 'cancelled')) {
      console.log(`[Stream] Closing connection for ${taskId} after ${event} event`)
      cleanup()
      await close()
    }
  })

  if (!currentStatus) {
    console.log(`[Stream] Task ${taskId} not in scheduler, checking database`)
    try {
      const prisma = (await import('@/lib/db')).default
      const dbTask = await prisma.inferenceTask.findUnique({ where: { id: taskId } })

      if (dbTask) {
        if (dbTask.status === 'completed') {
          if (dbTask.chatId) enqueueWrite(sseEvent('chatId', { id: dbTask.chatId, oldId: '' }))
          if (dbTask.result) enqueueWrite(sseEvent('text', { content: dbTask.result, replace: true }))
          enqueueWrite(sseEvent('done', { textLength: dbTask.result?.length || 0, chatId: dbTask.chatId }))
          cleanup()
          await close()
          return new Response(stream.readable, { headers: sseHeaders })
        } else if (dbTask.status === 'failed') {
          enqueueWrite(sseEvent('task_error', { message: dbTask.error || '任务失败' }))
          cleanup()
          await close()
          return new Response(stream.readable, { headers: sseHeaders })
        } else if (dbTask.status === 'cancelled') {
          enqueueWrite(sseEvent('status', { type: 'task', stage: 'cancelled', message: '任务已取消' }))
          cleanup()
          await close()
          return new Response(stream.readable, { headers: sseHeaders })
        } else {
          console.log(`[Stream] Task ${taskId} in DB with status=${dbTask.status}, keeping connection open`)
        }
      } else {
        enqueueWrite(sseEvent('task_error', { message: '任务未找到' }))
        cleanup()
        await close()
        return new Response(stream.readable, { headers: sseHeaders })
      }
    } catch {
      enqueueWrite(sseEvent('task_error', { message: '任务查询失败' }))
      cleanup()
      await close()
      return new Response(stream.readable, { headers: sseHeaders })
    }
  }

  const finalCheck = scheduler.getTaskStatus(taskId)
  if (isTerminalStatus(finalCheck)) {
    console.log(`[Stream] Task ${taskId} completed during setup, closing`)
    cleanup()
    await close()
    return new Response(stream.readable, { headers: sseHeaders })
  }

  const abortHandler = () => {
    console.log(`[Stream] Abort for task ${taskId}`)
    cleanup()
    close()
  }

  req.signal.addEventListener('abort', abortHandler, { once: true })

  setTimeout(() => {
    console.log(`[Stream] Timeout for task ${taskId}`)
    cleanup()
    close()
  }, 300000)

  return new Response(stream.readable, { headers: sseHeaders })
}
