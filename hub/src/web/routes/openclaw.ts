import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { OpenClawUpstreamError } from '../../openclaw/client'
import type { OpenClawChatService } from '../../openclaw/types'
import type { WebAppEnv } from '../middleware/auth'

const messageQuerySchema = z.object({
    conversationId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional()
})

const stateQuerySchema = z.object({
    conversationId: z.string().min(1)
})

const sendMessageBodySchema = z.object({
    conversationId: z.string().min(1),
    text: z.string().min(1)
})

export function createOpenClawRoutes(
    getService: () => OpenClawChatService | null
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    const toErrorResponse = (c: Context<WebAppEnv>, error: unknown): Response => {
        const message = error instanceof Error ? error.message : 'Internal server error'
        if (message === 'Conversation not found' || message === 'Approval request not found') {
            return c.json({ error: message }, 404)
        }
        if (error instanceof OpenClawUpstreamError) {
            if (error.status === 409) {
                return c.json({
                    error: error.message,
                    retryAfterMs: error.retryAfterMs ?? undefined
                }, 409)
            }
            return c.json({ error: error.message }, 502)
        }
        return c.json({ error: 'Internal server error' }, 500)
    }

    const requireService = (c: Context<WebAppEnv>): OpenClawChatService | Response => {
        const service = getService()
        if (!service) {
            return c.json({ error: 'OpenClaw service unavailable' }, 503)
        }
        return service
    }

    app.get('/openclaw/conversation', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const namespace = c.get('namespace')
        const userKey = `${namespace}:${c.get('userId')}`
        const conversation = await service.getOrCreateDefaultConversation({ namespace, userKey })
        return c.json({ conversation })
    })

    app.get('/openclaw/messages', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const parsed = messageQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const namespace = c.get('namespace')
        const userKey = `${namespace}:${c.get('userId')}`
        try {
            const result = await service.listMessages({
                namespace,
                userKey,
                conversationId: parsed.data.conversationId,
                beforeSeq: parsed.data.beforeSeq ?? null,
                limit: parsed.data.limit ?? 50
            })
            return c.json(result)
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.get('/openclaw/state', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const parsed = stateQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const namespace = c.get('namespace')
        const userKey = `${namespace}:${c.get('userId')}`
        try {
            const state = await service.getState({
                namespace,
                userKey,
                conversationId: parsed.data.conversationId
            })
            return c.json({ state })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/openclaw/messages', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const body = await c.req.json().catch(() => null)
        const parsed = sendMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const userKey = `${namespace}:${c.get('userId')}`
        try {
            const message = await service.sendMessage({
                namespace,
                conversationId: parsed.data.conversationId,
                userKey,
                text: parsed.data.text
            })
            return c.json({ ok: true, message })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/openclaw/approvals/:requestId/approve', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const conversationId = c.req.query('conversationId')
        if (!conversationId) {
            return c.json({ error: 'Missing conversationId' }, 400)
        }

        try {
            await service.approve({
                namespace: c.get('namespace'),
                userKey: `${c.get('namespace')}:${c.get('userId')}`,
                conversationId,
                requestId: c.req.param('requestId')
            })
            return c.json({ ok: true })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    app.post('/openclaw/approvals/:requestId/deny', async (c) => {
        const service = requireService(c)
        if (service instanceof Response) {
            return service
        }

        const conversationId = c.req.query('conversationId')
        if (!conversationId) {
            return c.json({ error: 'Missing conversationId' }, 400)
        }

        try {
            await service.deny({
                namespace: c.get('namespace'),
                userKey: `${c.get('namespace')}:${c.get('userId')}`,
                conversationId,
                requestId: c.req.param('requestId')
            })
            return c.json({ ok: true })
        } catch (error) {
            return toErrorResponse(c, error)
        }
    })

    return app
}
