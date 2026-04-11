import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'
import { DefaultOpenClawChatService } from './OpenClawChatService'
import type { OpenClawClient } from './client'
import type { SyncEvent } from '../sync/syncEngine'

function createClient(): OpenClawClient {
    return {
        async ensureDefaultConversation(input) {
            return {
                conversationId: `openclaw:${input.externalUserKey}`,
                title: 'OpenClaw'
            }
        },
        async sendMessage() {
            return { assistantMessages: [] }
        },
        async approve() {
            return {}
        },
        async deny() {
            return {}
        }
    }
}

describe('DefaultOpenClawChatService', () => {
    it('persists inbound state updates so refetch returns the same values', async () => {
        const store = new Store(':memory:')
        const manager = new SSEManager(0, new VisibilityTracker())
        const events: SyncEvent[] = []

        manager.subscribe({
            id: 'openclaw',
            namespace: 'default',
            openclawConversationId: 'placeholder',
            send: (event) => {
                events.push(event)
            },
            sendHeartbeat: () => {}
        })

        const service = new DefaultOpenClawChatService(store, manager, createClient())
        const conversation = await service.getOrCreateDefaultConversation({
            namespace: 'default',
            userKey: 'default:1'
        })

        manager.unsubscribe('openclaw')
        manager.subscribe({
            id: 'openclaw',
            namespace: 'default',
            openclawConversationId: conversation.id,
            send: (event) => {
                events.push(event)
            },
            sendHeartbeat: () => {}
        })

        await service.ingestInboundEvent({
            type: 'state',
            namespace: 'default',
            conversationId: conversation.id,
            connected: false,
            thinking: true,
            lastError: 'upstream offline'
        })

        const state = await service.getState({
            namespace: 'default',
            userKey: 'default:1',
            conversationId: conversation.id
        })

        expect(state.connected).toBe(false)
        expect(state.thinking).toBe(true)
        expect(state.lastError).toBe('upstream offline')

        const stateEvent = events.find((event): event is Extract<SyncEvent, { type: 'openclaw-state' }> => event.type === 'openclaw-state')
        expect(stateEvent?.state.connected).toBe(false)
        expect(stateEvent?.state.thinking).toBe(true)
        expect(stateEvent?.state.lastError).toBe('upstream offline')
    })

    it('rejects access to another user conversation', async () => {
        const store = new Store(':memory:')
        const manager = new SSEManager(0, new VisibilityTracker())
        const service = new DefaultOpenClawChatService(store, manager, createClient())

        const conversation = await service.getOrCreateDefaultConversation({
            namespace: 'default',
            userKey: 'default:1'
        })

        expect(await service.verifyConversationAccess({
            namespace: 'default',
            userKey: 'default:2',
            conversationId: conversation.id
        })).toBe(false)

        await expect(service.getState({
            namespace: 'default',
            userKey: 'default:2',
            conversationId: conversation.id
        })).rejects.toThrow('Conversation not found')
    })

    it('keeps approvals pending when upstream approve fails', async () => {
        const store = new Store(':memory:')
        const manager = new SSEManager(0, new VisibilityTracker())
        const service = new DefaultOpenClawChatService(store, manager, {
            ...createClient(),
            async approve() {
                throw new Error('upstream failed')
            }
        })

        const conversation = await service.getOrCreateDefaultConversation({
            namespace: 'default',
            userKey: 'default:1'
        })

        store.openclawApprovals.upsertApproval({
            id: 'req-1',
            conversationId: conversation.id,
            namespace: 'default',
            title: 'Approve action'
        })

        await expect(service.approve({
            namespace: 'default',
            userKey: 'default:1',
            conversationId: conversation.id,
            requestId: 'req-1'
        })).rejects.toThrow('upstream failed')

        const state = await service.getState({
            namespace: 'default',
            userKey: 'default:1',
            conversationId: conversation.id
        })
        expect(state.pendingApprovals ?? []).toHaveLength(1)
        expect(state.pendingApprovals?.[0]?.id).toBe('req-1')
    })
})
