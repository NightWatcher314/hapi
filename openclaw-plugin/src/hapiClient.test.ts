import { describe, expect, it, mock } from 'bun:test'
import { HapiCallbackClient } from './hapiClient'

describe('HapiCallbackClient', () => {
    it('does nothing when callback config is absent', async () => {
        const client = new HapiCallbackClient(null, null)
        await expect(client.postEvent({
            type: 'state',
            eventId: 'evt-1',
            occurredAt: 1,
            namespace: 'default',
            conversationId: 'thread-1',
            connected: true,
            thinking: false,
            lastError: null
        })).resolves.toBeUndefined()
    })

    it('posts signed events to hapi callback endpoint', async () => {
        const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
        const originalFetch = globalThis.fetch
        globalThis.fetch = fetchMock as unknown as typeof fetch

        try {
            const client = new HapiCallbackClient('http://example.com', 'secret')
            await client.postEvent({
                type: 'state',
                eventId: 'evt-1',
                occurredAt: 1,
                namespace: 'default',
                conversationId: 'thread-1',
                connected: true,
                thinking: false,
                lastError: null
            })

            expect(fetchMock).toHaveBeenCalledTimes(1)
            const calls = fetchMock.mock.calls as unknown as unknown[][]
            const firstCall = calls[0]
            expect(firstCall).toBeDefined()
            const init = firstCall?.[1] as RequestInit | undefined
            const headers = new Headers(init?.headers)
            expect(headers.get('x-openclaw-timestamp')).not.toBeNull()
            expect(headers.get('x-openclaw-signature')).not.toBeNull()
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
