import { describe, expect, it } from 'bun:test'
import { createPluginApp } from './routes'
import { HapiCallbackClient } from './hapiClient'
import { MockOpenClawRuntime } from './openclawRuntime'
import type { OpenClawAdapterRuntime } from './types'

const stubLogger = {
    info() {},
    warn() {},
    error() {}
}

class StubCallbackClient extends HapiCallbackClient {
    events: unknown[] = []

    constructor() {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(event: unknown): Promise<void> {
        this.events.push(event)
    }
}

function createApp(runtime: OpenClawAdapterRuntime = new MockOpenClawRuntime('default')) {
    const callbackClient = new StubCallbackClient()
    const app = createPluginApp({
        sharedSecret: 'plugin-secret',
        namespace: 'default',
        callbackClient,
        runtime,
        idempotencyCache: new Map(),
        prototypeCaptureSessionKey: null,
        prototypeCaptureFileName: 'transcript-capture.jsonl',
        logger: stubLogger
    })
    return { app, callbackClient }
}

class BusyRuntime implements OpenClawAdapterRuntime {
    readonly supportsApprovals = false

    async ensureDefaultConversation(): Promise<{ conversationId: string; title: string }> {
        return { conversationId: 'thread-1', title: 'OpenClaw' }
    }

    isConversationBusy(): boolean {
        return true
    }

    async sendMessage(): Promise<void> {
        throw new Error('sendMessage should not be called when busy')
    }

    async approve(): Promise<void> {
        throw new Error('approve should not be called')
    }

    async deny(): Promise<void> {
        throw new Error('deny should not be called')
    }
}

describe('openclaw plugin routes', () => {
    it('rejects unauthorized command requests', async () => {
        const { app } = createApp()
        const response = await app.request('/hapi/channel/messages', { method: 'POST' })
        expect(response.status).toBe(401)
    })

    it('reports prototype capture status from health', async () => {
        const { app } = createApp()
        const response = await app.request('/hapi/health')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            pluginVersion: '0.1.0',
            openclawConnected: true,
            prototypeCapture: {
                enabled: false,
                sessionKey: null,
                fileName: 'transcript-capture.jsonl'
            }
        })
    })

    it('does not expose the legacy non-/hapi routes', async () => {
        const { app } = createApp()
        const response = await app.request('/channel/messages', { method: 'POST' })
        expect(response.status).toBe(404)
    })

    it('returns idempotent acknowledgements for repeated send-message calls', async () => {
        const { app, callbackClient } = createApp()
        const init = {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1',
                text: 'hello',
                localMessageId: 'msg-1'
            })
        }

        const first = await app.request('/hapi/channel/messages', init)
        const firstJson = await first.json() as { upstreamRequestId: string }
        const second = await app.request('/hapi/channel/messages', init)
        const secondJson = await second.json() as { upstreamRequestId: string }

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(secondJson.upstreamRequestId).toBe(firstJson.upstreamRequestId)

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(callbackClient.events.length).toBeGreaterThan(0)
    })

    it('creates approval-request events when message text contains approval', async () => {
        const { app, callbackClient } = createApp()
        await app.request('/hapi/channel/messages', {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-approval-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1',
                text: 'please ask for approval',
                localMessageId: 'msg-1'
            })
        })

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(callbackClient.events.some((event) => {
            return typeof event === 'object'
                && event !== null
                && 'type' in event
                && event.type === 'approval-request'
        })).toBe(true)
    })

    it('rejects send-message when the conversation already has an active run', async () => {
        const { app } = createApp(new BusyRuntime())
        const response = await app.request('/hapi/channel/messages', {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-busy-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1',
                text: 'hello',
                localMessageId: 'msg-1'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Conversation already has an active OpenClaw run',
            retryAfterMs: 1000
        })
    })

    it('returns 501 for approval endpoints when real approval bridge is not implemented', async () => {
        const { app } = createApp(new BusyRuntime())

        const approveResponse = await app.request('/hapi/channel/approvals/request-1/approve', {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-approve-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1'
            })
        })

        const denyResponse = await app.request('/hapi/channel/approvals/request-1/deny', {
            method: 'POST',
            headers: {
                authorization: 'Bearer plugin-secret',
                'content-type': 'application/json',
                'idempotency-key': 'idem-deny-1'
            },
            body: JSON.stringify({
                conversationId: 'thread-1'
            })
        })

        expect(approveResponse.status).toBe(501)
        expect(await approveResponse.json()).toEqual({
            error: 'OpenClaw approval bridge is not implemented yet'
        })
        expect(denyResponse.status).toBe(501)
        expect(await denyResponse.json()).toEqual({
            error: 'OpenClaw approval bridge is not implemented yet'
        })
    })
})
