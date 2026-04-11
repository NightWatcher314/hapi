import { Hono } from 'hono'
import { z } from 'zod'
import type { OpenClawChatService, OpenClawInboundEvent } from '../../openclaw/types'

const ingressEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('message'),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']).optional(),
        text: z.string(),
        externalMessageId: z.string().optional(),
        createdAt: z.number().optional(),
        status: z.enum(['streaming', 'completed', 'failed']).optional()
    }),
    z.object({
        type: z.literal('approval-request'),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        createdAt: z.number().optional()
    }),
    z.object({
        type: z.literal('approval-resolved'),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        status: z.enum(['approved', 'denied'])
    }),
    z.object({
        type: z.literal('state'),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        connected: z.boolean(),
        thinking: z.boolean(),
        lastError: z.string().nullable().optional()
    })
])

function isAuthorized(req: Request): boolean {
    const expected = process.env.OPENCLAW_CHANNEL_TOKEN?.trim()
    if (!expected) {
        return true
    }
    const header = req.headers.get('x-openclaw-token')?.trim()
    return header === expected
}

export function createOpenClawIngressRoutes(
    getService: () => OpenClawChatService | null
): Hono {
    const app = new Hono()

    app.post('/openclaw/channel/events', async (c) => {
        if (!isAuthorized(c.req.raw)) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const service = getService()
        if (!service) {
            return c.json({ error: 'OpenClaw service unavailable' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = ingressEventSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        await service.ingestInboundEvent(parsed.data as OpenClawInboundEvent)
        return c.json({ ok: true })
    })

    return app
}
