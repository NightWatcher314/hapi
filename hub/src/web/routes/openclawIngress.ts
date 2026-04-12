import { Hono } from 'hono'
import { z } from 'zod'
import { getOpenClawTransportConfig } from '../../openclaw/config'
import { parseOfficialOpenClawEvent, verifyOfficialOpenClawSignature } from '../../openclaw/protocol'
import type { OpenClawChatService } from '../../openclaw/types'
import type { Store } from '../../store'

const legacyIngressEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('message'),
        eventId: z.string().optional(),
        occurredAt: z.number().optional(),
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
        eventId: z.string().optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        createdAt: z.number().optional()
    }),
    z.object({
        type: z.literal('approval-resolved'),
        eventId: z.string().optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        status: z.enum(['approved', 'denied'])
    }),
    z.object({
        type: z.literal('state'),
        eventId: z.string().optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1),
        conversationId: z.string().min(1),
        connected: z.boolean(),
        thinking: z.boolean(),
        lastError: z.string().nullable().optional()
    })
])

function isLegacyAuthorized(req: Request, expectedToken: string | null): boolean {
    if (!expectedToken) {
        return true
    }
    const header = req.headers.get('x-openclaw-token')?.trim()
    return header === expectedToken
}

export function createOpenClawIngressRoutes(
    getService: () => OpenClawChatService | null,
    getStore: () => Store | null
): Hono {
    const app = new Hono()

    app.post('/openclaw/channel/events', async (c) => {
        const service = getService()
        const store = getStore()
        if (!service || !store) {
            return c.json({ error: 'OpenClaw service unavailable' }, 503)
        }

        const config = getOpenClawTransportConfig()
        const rawBody = await c.req.text().catch(() => '')
        if (!rawBody) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let event
        try {
            if (config.signingSecret) {
                const verification = verifyOfficialOpenClawSignature({
                    headers: c.req.raw.headers,
                    rawBody,
                    signingSecret: config.signingSecret,
                    now: Date.now(),
                    allowedTimestampSkewMs: config.allowedTimestampSkewMs
                })
                if (!verification.ok) {
                    return c.json({ error: verification.reason }, 401)
                }

                event = parseOfficialOpenClawEvent({
                    rawBody,
                    namespaceResolver: (conversationId) => {
                        const record = store.openclawConversations.findConversationByExternalId(conversationId)
                        return record?.namespace ?? null
                    }
                })
            } else {
                if (!isLegacyAuthorized(c.req.raw, config.legacyChannelToken)) {
                    return c.json({ error: 'Unauthorized' }, 401)
                }

                const parsed = legacyIngressEventSchema.safeParse(JSON.parse(rawBody) as unknown)
                if (!parsed.success) {
                    return c.json({ error: 'Invalid body' }, 400)
                }

                event = parseOfficialOpenClawEvent({
                    rawBody,
                    defaultNamespace: parsed.data.namespace
                })
            }
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Invalid body' }, 400)
        }

        const existingReceipt = store.openclawReceipts.getReceipt(event.namespace, event.eventId)
        if (existingReceipt?.processedAt) {
            return c.json({ ok: true, duplicate: true })
        }

        store.openclawReceipts.recordReceipt({
            namespace: event.namespace,
            eventId: event.eventId,
            upstreamConversationId: event.conversationId,
            eventType: event.type
        })

        await service.ingestInboundEvent(event)
        store.openclawReceipts.markProcessed(event.namespace, event.eventId)
        return c.json({ ok: true })
    })

    return app
}
