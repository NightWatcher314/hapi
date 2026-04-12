import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { OpenClawUpstreamError } from '../../openclaw/client'
import type { OpenClawChatService } from '../../openclaw/types'
import type { WebAppEnv } from '../middleware/auth'
import { createOpenClawRoutes } from './openclaw'

function createService(): OpenClawChatService {
    return {
        async getOrCreateDefaultConversation() {
            return {
                id: 'conv-1',
                title: 'OpenClaw',
                status: 'ready',
                createdAt: 1,
                updatedAt: 1
            }
        },
        async verifyConversationAccess() {
            return true
        },
        async listMessages() {
            return {
                messages: [{
                    id: 'msg-1',
                    conversationId: 'conv-1',
                    role: 'assistant',
                    text: 'hello',
                    createdAt: 1,
                    status: 'completed'
                }],
                page: {
                    limit: 50,
                    beforeSeq: null,
                    nextBeforeSeq: 1,
                    hasMore: false
                }
            }
        },
        async getState() {
            return {
                conversationId: 'conv-1',
                connected: true,
                thinking: false,
                lastError: null,
                pendingApprovals: []
            }
        },
        async sendMessage() {
            return {
                id: 'msg-user',
                conversationId: 'conv-1',
                role: 'user',
                text: 'hello',
                createdAt: 1,
                status: 'completed'
            }
        },
        async approve() {},
        async deny() {},
        async ingestInboundEvent() {}
    }
}

function createNotFoundService(): OpenClawChatService {
    return {
        ...createService(),
        async listMessages() {
            throw new Error('Conversation not found')
        },
        async getState() {
            throw new Error('Conversation not found')
        },
        async sendMessage() {
            throw new Error('Conversation not found')
        },
        async approve() {
            throw new Error('Conversation not found')
        },
        async deny() {
            throw new Error('Conversation not found')
        }
    }
}

function createBusyService(): OpenClawChatService {
    return {
        ...createService(),
        async sendMessage() {
            throw new OpenClawUpstreamError(409, 'Conversation already has an active OpenClaw run', 1000)
        }
    }
}

function createApp(service: OpenClawChatService) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        c.set('userId', 1)
        await next()
    })
    app.route('/api', createOpenClawRoutes(() => service))
    return app
}

describe('openclaw routes', () => {
    it('returns the default conversation', async () => {
        const response = await createApp(createService()).request('/api/openclaw/conversation')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            conversation: {
                id: 'conv-1',
                title: 'OpenClaw',
                status: 'ready',
                createdAt: 1,
                updatedAt: 1
            }
        })
    })

    it('requires conversationId for approval actions', async () => {
        const response = await createApp(createService()).request('/api/openclaw/approvals/req-1/approve', {
            method: 'POST'
        })
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Missing conversationId' })
    })

    it('maps conversation ownership denial on state to 404', async () => {
        const response = await createApp(createNotFoundService()).request('/api/openclaw/state?conversationId=conv-2')
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Conversation not found' })
    })

    it('maps conversation ownership denial on messages to 404', async () => {
        const response = await createApp(createNotFoundService()).request('/api/openclaw/messages?conversationId=conv-2')
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Conversation not found' })
    })

    it('maps conversation ownership denial on approval actions to 404', async () => {
        const response = await createApp(createNotFoundService()).request('/api/openclaw/approvals/req-1/approve?conversationId=conv-2', {
            method: 'POST'
        })
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Conversation not found' })
    })

    it('preserves upstream 409 busy errors on send-message', async () => {
        const response = await createApp(createBusyService()).request('/api/openclaw/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                conversationId: 'conv-1',
                text: 'hello'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Conversation already has an active OpenClaw run',
            retryAfterMs: 1000
        })
    })
})
