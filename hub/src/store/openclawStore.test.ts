import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('OpenClaw store', () => {
    it('creates a per-user conversation and stores messages and approvals', () => {
        const store = new Store(':memory:')

        const conversation = store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'openclaw:default:1',
            title: 'OpenClaw'
        })

        expect(conversation.namespace).toBe('default')
        expect(conversation.userKey).toBe('default:1')

        const userMessage = store.openclawMessages.addMessage({
            conversationId: conversation.id,
            namespace: 'default',
            role: 'user',
            text: 'hello'
        })
        const assistantMessage = store.openclawMessages.addMessage({
            conversationId: conversation.id,
            namespace: 'default',
            role: 'assistant',
            text: 'world'
        })

        const messages = store.openclawMessages.getMessages('default', conversation.id)
        expect(messages.map((message) => message.id)).toEqual([userMessage.id, assistantMessage.id])

        const approval = store.openclawApprovals.upsertApproval({
            id: 'req-1',
            conversationId: conversation.id,
            namespace: 'default',
            title: 'Approve action',
            description: 'Need approval'
        })

        expect(approval.status).toBe('pending')
        expect(store.openclawApprovals.listPending('default', conversation.id)).toHaveLength(1)

        const resolved = store.openclawApprovals.resolve('default', conversation.id, 'req-1', 'approved')
        expect(resolved?.status).toBe('approved')
        expect(store.openclawApprovals.listPending('default', conversation.id)).toHaveLength(0)
    })

    it('persists conversation state fields', () => {
        const store = new Store(':memory:')

        const conversation = store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'openclaw:default:1',
            title: 'OpenClaw'
        })

        expect(conversation.connected).toBe(true)
        expect(conversation.thinking).toBe(false)
        expect(conversation.lastError).toBeNull()

        const updated = store.openclawConversations.updateConversation(conversation.id, 'default', {
            connected: false,
            thinking: true,
            lastError: 'socket lost'
        })

        expect(updated?.connected).toBe(false)
        expect(updated?.thinking).toBe(true)
        expect(updated?.lastError).toBe('socket lost')
    })

    it('updates a message when a later chunk reuses the external id', () => {
        const store = new Store(':memory:')

        const conversation = store.openclawConversations.getOrCreateConversation('default', 'default:1', {
            externalId: 'openclaw:default:1',
            title: 'OpenClaw'
        })

        const first = store.openclawMessages.addMessage({
            conversationId: conversation.id,
            namespace: 'default',
            externalId: 'ext-1',
            role: 'assistant',
            text: 'partial',
            status: 'streaming'
        })

        const second = store.openclawMessages.addMessage({
            conversationId: conversation.id,
            namespace: 'default',
            externalId: 'ext-1',
            role: 'assistant',
            text: 'final answer',
            status: 'completed'
        })

        expect(second.id).toBe(first.id)
        expect(second.seq).toBe(first.seq)
        expect(second.text).toBe('final answer')
        expect(second.status).toBe('completed')

        const messages = store.openclawMessages.getMessages('default', conversation.id)
        expect(messages).toHaveLength(1)
        expect(messages[0]?.text).toBe('final answer')
        expect(messages[0]?.status).toBe('completed')
    })
})
