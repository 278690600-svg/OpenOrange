import { NextResponse } from 'next/server'
import { getTaskScheduler } from '@/lib/task-scheduler'

export async function POST(req: Request) {
  try {
    const { taskId } = await req.json()

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const scheduler = getTaskScheduler()
    const cancelled = scheduler.cancel(taskId)

    return NextResponse.json({ success: cancelled, taskId })
  } catch (error: unknown) {
    console.error('[Cancel API] Error:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to cancel task' }, { status: 500 })
  }
}
