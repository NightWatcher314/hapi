import { afterEach, describe, expect, it, mock } from 'bun:test'
import { createOpenClawClient, OpenClawUpstreamError } from './client'

describe('createOpenClawClient', () => {
    afterEach(() => {
        delete process.env.OPENCLAW_PLUGIN_BASE_URL
        delete process.env.OPENCLAW_SHARED_SECRET
    })

    it('uses canonical /hapi channel routes and shared-secret auth', async () => {
        process.env.OPENCLAW_PLUGIN_BASE_URL = 'http://plugin.example'
        process.env.OPENCLAW_SHARED_SECRET = 'shared-secret'

        const fetchMock = mock(async () => new Response(JSON.stringify({
            conversationId: 'thread-1',
            requestId: 'req-1'
        }), { status: 200 }))
        const originalFetch = globalThis.fetch
        globalThis.fetch = fetchMock as unknown as typeof fetch

        try {
            const client = createOpenClawClient()
            await client.sendMessage({
                conversationId: 'thread-1',
                text: 'hello',
                localMessageId: 'msg-1',
                idempotencyKey: 'idem-1'
            })

            expect(fetchMock).toHaveBeenCalledTimes(1)
            const calls = fetchMock.mock.calls as unknown as unknown[][]
            const firstCall = calls[0]
            expect(firstCall?.[0]).toBe('http://plugin.example/hapi/channel/messages')
            const init = firstCall?.[1] as RequestInit | undefined
            const headers = new Headers(init?.headers)
            expect(headers.get('authorization')).toBe('Bearer shared-secret')
            expect(headers.get('idempotency-key')).toBe('idem-1')
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('throws when required config is incomplete', () => {
        expect(() => createOpenClawClient()).toThrow(
            'OpenClaw transport is missing OPENCLAW_PLUGIN_BASE_URL or OPENCLAW_SHARED_SECRET'
        )
    })

    it('preserves upstream 409 retry metadata', async () => {
        process.env.OPENCLAW_PLUGIN_BASE_URL = 'http://plugin.example'
        process.env.OPENCLAW_SHARED_SECRET = 'shared-secret'

        const fetchMock = mock(async () => new Response(JSON.stringify({
            error: 'Conversation already has an active OpenClaw run',
            retryAfterMs: 1000
        }), { status: 409 }))
        const originalFetch = globalThis.fetch
        globalThis.fetch = fetchMock as unknown as typeof fetch

        try {
            const client = createOpenClawClient()
            await expect(client.sendMessage({
                conversationId: 'thread-1',
                text: 'hello',
                localMessageId: 'msg-1',
                idempotencyKey: 'idem-1'
            })).rejects.toMatchObject({
                name: 'OpenClawUpstreamError',
                status: 409,
                retryAfterMs: 1000,
                message: 'Conversation already has an active OpenClaw run'
            } satisfies Partial<OpenClawUpstreamError>)
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
