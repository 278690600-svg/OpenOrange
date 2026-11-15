import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { triggerWebhook, WEBHOOK_EVENTS } from '@/lib/webhook'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const webhookId = searchParams.get('webhookId')
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  if (searchParams.has('webhookId') && !webhookId) {
    return NextResponse.json({ error: 'Invalid webhookId' }, { status: 400 })
  }

  if (webhookId) {
    const logs = await prisma.webhookLog.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(logs)
  }

  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { logs: true } },
    },
  })
  return NextResponse.json(webhooks)
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const id = searchParams.get('id')

    if (action === 'test' && id) {
      const webhook = await prisma.webhook.findUnique({ where: { id } })
      if (!webhook) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
      }

      await triggerWebhook('test', {
        event: 'test',
        message: 'This is a test webhook from ClosedUI',
        timestamp: new Date().toISOString(),
      })

      return NextResponse.json({ success: true, message: 'Test webhook triggered' })
    }

    const body = await req.json()
    const { url, events, secret } = body as { url?: string; events?: string[]; secret?: string }

    if (!url || !events?.length) {
      return NextResponse.json({ error: 'url and events are required' }, { status: 400 })
    }

    const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e as (typeof WEBHOOK_EVENTS)[number]))
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}`, validEvents: WEBHOOK_EVENTS },
        { status: 400 }
      )
    }

    const webhook = await prisma.webhook.create({
      data: {
        url,
        events: JSON.stringify(events),
        secret: secret || crypto.randomUUID(),
        active: true,
      },
    })

    return NextResponse.json(webhook, { status: 201 })
  } catch (err) {
    console.error('[Webhooks API] Create error:', err)
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, url, events, active } = body as { id?: string; url?: string; events?: string[]; active?: boolean }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await prisma.webhook.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    if (events) {
      const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e as (typeof WEBHOOK_EVENTS)[number]))
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { error: `Invalid events: ${invalidEvents.join(', ')}`, validEvents: WEBHOOK_EVENTS },
          { status: 400 }
        )
      }
    }

    const webhook = await prisma.webhook.update({
      where: { id },
      data: {
        ...(url !== undefined && { url }),
        ...(events && { events: JSON.stringify(events) }),
        ...(active !== undefined && { active }),
      },
    })

    return NextResponse.json(webhook)
  } catch (err) {
    console.error('[Webhooks API] Update error:', err)
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
    }

    const existing = await prisma.webhook.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    await prisma.webhook.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Webhooks API] Delete error:', err)
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
  }
}
