import crypto from 'crypto'
import prisma from '@/lib/db'

export const WEBHOOK_EVENTS = [
  'chat.created',
  'chat.completed',
  'message.sent',
  'workflow.executed',
  'file.uploaded',
  'error.occurred',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function triggerWebhook(event: string, payload: object) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { active: true },
    })

    const matchingWebhooks = webhooks.filter((wh) => {
      const events: string[] = JSON.parse(wh.events)
      return events.includes(event)
    })

    if (matchingWebhooks.length === 0) return

    const body = JSON.stringify(payload)
    const now = new Date()

    await Promise.allSettled(
      matchingWebhooks.map(async (wh) => {
        const signature = signPayload(body, wh.secret)

        let responseStatus: number | null = null
        let responseBody: string | null = null

        try {
          const res = await fetch(wh.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Event': event,
              'X-Webhook-Signature': signature,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          })

          responseStatus = res.status
          responseBody = await res.text()
        } catch (err) {
          responseBody = (err as Error).message
        }

        await prisma.webhookLog.create({
          data: {
            webhookId: wh.id,
            event,
            payload: body,
            responseStatus,
            responseBody,
          },
        })

        await prisma.webhook.update({
          where: { id: wh.id },
          data: { lastTriggeredAt: now },
        })
      })
    )
  } catch (err) {
    console.error('[Webhook] Failed to trigger webhooks:', err)
  }
}
