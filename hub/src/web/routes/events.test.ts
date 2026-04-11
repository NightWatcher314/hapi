import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { OpenClawChatService } from '../../openclaw/types'
import { SSEManager } from '../../sse/sseManager'
import { SyncEngine } from '../../sync/syncEngine'
import { Store } from '../../store'
import { VisibilityTracker } from '../../visibility/visibilityTracker'
import type { WebAppEnv } from '../middleware/auth'
import { createEventsRoutes } from './events'

function createOpenClawService(allowed: boolean): OpenClawChatService {
    return {
        async getOrCreateDefaultConversation() {
            throw new Error('not used')
        },
        async verifyConversationAccess() {
            return allowed
        },
        async listMessages() {
            throw new Error('not used')
        },
        async getState() {
            throw new Error('not used')
        },
        async sendMessage() {
            throw new Error('not used')
        },
        async approve() {
            throw new Error('not used')
        },
        async deny() {
            throw new Error('not used')
        },
        async ingestInboundEvent() {
            throw new Error('not used')
        }
    }
}

function createApp(allowed: boolean) {
    const app = new Hono<WebAppEnv>()
    const store = new Store(':memory:')
    const visibilityTracker = new VisibilityTracker()
    const sseManager = new SSEManager(0, visibilityTracker)
    const syncEngine = new SyncEngine(store, null as never, null as never, sseManager)

    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        c.set('userId', 1)
        await next()
    })
    app.route('/api', createEventsRoutes(
        () => sseManager,
        () => syncEngine,
        () => createOpenClawService(allowed),
        () => visibilityTracker
    ))
    return app
}

describe('events routes', () => {
    it('rejects SSE subscription for an unowned OpenClaw conversation', async () => {
        const response = await createApp(false).request('/api/events?openclawConversationId=conv-1')
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Conversation not found' })
    })
})
