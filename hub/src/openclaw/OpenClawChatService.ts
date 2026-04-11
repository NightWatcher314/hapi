import type {
    OpenClawApprovalRequest,
    OpenClawConversationSummary,
    OpenClawMessage,
    OpenClawState
} from '@hapi/protocol/types'
import type { Store } from '../store'
import type { OpenClawClient } from './client'
import { OpenClawEventPublisher } from './eventPublisher'
import type { OpenClawChatService, OpenClawInboundEvent, OpenClawMessagePage } from './types'

function toConversationSummary(conversation: {
    id: string
    title: string | null
    status: string
    createdAt: number
    updatedAt: number
}): OpenClawConversationSummary {
    return {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status === 'waiting' || conversation.status === 'error' ? conversation.status : 'ready',
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
    }
}

function toState(conversation: {
    id: string
    connected: boolean
    thinking: boolean
    lastError: string | null
}, approvals: OpenClawApprovalRequest[]): OpenClawState {
    return {
        conversationId: conversation.id,
        connected: conversation.connected,
        thinking: conversation.thinking,
        lastError: conversation.lastError,
        pendingApprovals: approvals
    }
}

function toMessage(message: {
    id: string
    conversationId: string
    role: string
    text: string
    createdAt: number
    status: string | null
}): OpenClawMessage {
    return {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
        text: message.text,
        createdAt: message.createdAt,
        status: message.status === 'streaming' || message.status === 'failed' ? message.status : 'completed'
    }
}

function toApproval(approval: {
    id: string
    conversationId: string
    title: string
    description: string | null
    status: string
    createdAt: number
    resolvedAt: number | null
}): OpenClawApprovalRequest {
    return {
        id: approval.id,
        conversationId: approval.conversationId,
        title: approval.title,
        description: approval.description ?? undefined,
        status: approval.status === 'approved' || approval.status === 'denied' ? approval.status : 'pending',
        createdAt: approval.createdAt,
        resolvedAt: approval.resolvedAt ?? undefined
    }
}

export class DefaultOpenClawChatService implements OpenClawChatService {
    private readonly publisher: OpenClawEventPublisher

    constructor(
        private readonly store: Store,
        sseManager: import('../sse/sseManager').SSEManager,
        private readonly client: OpenClawClient
    ) {
        this.publisher = new OpenClawEventPublisher(sseManager)
    }

    private getOwnedConversation(input: {
        namespace: string
        userKey: string
        conversationId: string
    }) {
        const conversation = this.store.openclawConversations.getConversationByNamespace(
            input.conversationId,
            input.namespace
        )
        if (!conversation || conversation.userKey !== input.userKey) {
            return null
        }
        return conversation
    }

    async getOrCreateDefaultConversation(input: {
        namespace: string
        userKey: string
    }): Promise<OpenClawConversationSummary> {
        let conversation = this.store.openclawConversations.getConversationByUserKey(input.namespace, input.userKey)
        if (!conversation) {
            const ensured = await this.client.ensureDefaultConversation({
                externalUserKey: input.userKey
            })
            conversation = this.store.openclawConversations.getOrCreateConversation(input.namespace, input.userKey, {
                externalId: ensured.conversationId,
                title: ensured.title ?? 'OpenClaw',
                status: 'ready'
            })
        }
        return toConversationSummary(conversation)
    }

    async verifyConversationAccess(input: {
        namespace: string
        userKey: string
        conversationId: string
    }): Promise<boolean> {
        return Boolean(this.getOwnedConversation(input))
    }

    async listMessages(input: {
        namespace: string
        userKey: string
        conversationId: string
        beforeSeq?: number | null
        limit: number
    }): Promise<OpenClawMessagePage> {
        const conversation = this.getOwnedConversation(input)
        if (!conversation) {
            throw new Error('Conversation not found')
        }
        const messages = this.store.openclawMessages.getMessages(
            input.namespace,
            conversation.id,
            input.limit,
            input.beforeSeq
        )
        const first = messages[0]
        const hasMore = Boolean(first && first.seq > 1)
        return {
            messages: messages.map(toMessage),
            page: {
                limit: input.limit,
                beforeSeq: input.beforeSeq ?? null,
                nextBeforeSeq: first ? first.seq : null,
                hasMore
            }
        }
    }

    async getState(input: { namespace: string; userKey: string; conversationId: string }): Promise<OpenClawState> {
        const conversation = this.getOwnedConversation(input)
        if (!conversation) {
            throw new Error('Conversation not found')
        }
        const approvals = this.store.openclawApprovals.listPending(input.namespace, conversation.id)
        return toState(conversation, approvals.map(toApproval))
    }

    async sendMessage(input: {
        namespace: string
        conversationId: string
        userKey: string
        text: string
    }): Promise<OpenClawMessage> {
        const conversation = this.getOwnedConversation(input)
        if (!conversation) {
            throw new Error('Conversation not found')
        }

        const storedUserMessage = this.store.openclawMessages.addMessage({
            conversationId: input.conversationId,
            namespace: input.namespace,
            role: 'user',
            text: input.text,
            status: 'completed'
        })
        const userMessage = toMessage(storedUserMessage)
        this.publisher.message(input.namespace, input.conversationId, userMessage)

        const sendResult = await this.client.sendMessage({
            conversationId: conversation.externalId,
            text: input.text
        })

        for (const assistant of sendResult.assistantMessages ?? []) {
            const storedAssistant = this.store.openclawMessages.addMessage({
                conversationId: input.conversationId,
                namespace: input.namespace,
                externalId: assistant.externalMessageId ?? null,
                role: 'assistant',
                text: assistant.text,
                createdAt: assistant.createdAt,
                status: assistant.status ?? 'completed'
            })
            this.publisher.message(input.namespace, input.conversationId, toMessage(storedAssistant))
        }

        for (const approval of sendResult.approvals ?? []) {
            const storedApproval = this.store.openclawApprovals.upsertApproval({
                id: approval.id,
                conversationId: input.conversationId,
                namespace: input.namespace,
                title: approval.title,
                description: approval.description,
                status: 'pending',
                createdAt: approval.createdAt
            })
            this.publisher.approvalRequest(input.namespace, input.conversationId, toApproval(storedApproval))
        }

        this.publisher.state(input.namespace, input.conversationId, await this.getState({
            namespace: input.namespace,
            userKey: input.userKey,
            conversationId: input.conversationId
        }))

        return userMessage
    }

    async approve(input: { namespace: string; userKey: string; conversationId: string; requestId: string }): Promise<void> {
        const conversation = this.getOwnedConversation(input)
        if (!conversation) {
            throw new Error('Conversation not found')
        }
        const pending = this.store.openclawApprovals.listPending(input.namespace, conversation.id)
        if (!pending.some((approval) => approval.id === input.requestId)) {
            throw new Error('Approval request not found')
        }

        const result = await this.client.approve({ requestId: input.requestId })
        this.store.openclawApprovals.resolve(
            input.namespace,
            conversation.id,
            input.requestId,
            'approved'
        )
        if (result.assistantMessage) {
            const storedAssistant = this.store.openclawMessages.addMessage({
                conversationId: conversation.id,
                namespace: input.namespace,
                externalId: result.assistantMessage.externalMessageId ?? null,
                role: 'assistant',
                text: result.assistantMessage.text,
                createdAt: result.assistantMessage.createdAt
            })
            this.publisher.message(input.namespace, input.conversationId, toMessage(storedAssistant))
        }

        this.publisher.approvalResolved(input.namespace, input.conversationId, input.requestId, 'approved')
        this.publisher.state(input.namespace, input.conversationId, await this.getState({
            namespace: input.namespace,
            userKey: input.userKey,
            conversationId: input.conversationId
        }))
    }

    async deny(input: { namespace: string; userKey: string; conversationId: string; requestId: string }): Promise<void> {
        const conversation = this.getOwnedConversation(input)
        if (!conversation) {
            throw new Error('Conversation not found')
        }
        const pending = this.store.openclawApprovals.listPending(input.namespace, conversation.id)
        if (!pending.some((approval) => approval.id === input.requestId)) {
            throw new Error('Approval request not found')
        }

        const result = await this.client.deny({ requestId: input.requestId })
        this.store.openclawApprovals.resolve(
            input.namespace,
            conversation.id,
            input.requestId,
            'denied'
        )
        if (result.assistantMessage) {
            const storedAssistant = this.store.openclawMessages.addMessage({
                conversationId: conversation.id,
                namespace: input.namespace,
                externalId: result.assistantMessage.externalMessageId ?? null,
                role: 'assistant',
                text: result.assistantMessage.text,
                createdAt: result.assistantMessage.createdAt
            })
            this.publisher.message(input.namespace, input.conversationId, toMessage(storedAssistant))
        }

        this.publisher.approvalResolved(input.namespace, input.conversationId, input.requestId, 'denied')
        this.publisher.state(input.namespace, input.conversationId, await this.getState({
            namespace: input.namespace,
            userKey: input.userKey,
            conversationId: input.conversationId
        }))
    }

    async ingestInboundEvent(event: OpenClawInboundEvent): Promise<void> {
        if (event.type === 'message') {
            const conversation = this.store.openclawConversations.getConversationByExternalId(
                event.namespace,
                event.conversationId
            ) ?? this.store.openclawConversations.getConversationByNamespace(event.conversationId, event.namespace)

            if (!conversation) {
                throw new Error('Conversation not found for inbound event')
            }

            const storedMessage = this.store.openclawMessages.addMessage({
                conversationId: conversation.id,
                namespace: event.namespace,
                externalId: event.externalMessageId ?? null,
                role: event.role ?? 'assistant',
                text: event.text,
                createdAt: event.createdAt,
                status: event.status ?? 'completed'
            })
            this.publisher.message(event.namespace, conversation.id, toMessage(storedMessage))
            return
        }

        if (event.type === 'approval-request') {
            const conversation = this.store.openclawConversations.getConversationByExternalId(
                event.namespace,
                event.conversationId
            ) ?? this.store.openclawConversations.getConversationByNamespace(event.conversationId, event.namespace)

            if (!conversation) {
                throw new Error('Conversation not found for approval request')
            }

            const storedApproval = this.store.openclawApprovals.upsertApproval({
                id: event.requestId,
                conversationId: conversation.id,
                namespace: event.namespace,
                title: event.title,
                description: event.description,
                status: 'pending',
                createdAt: event.createdAt
            })
            this.publisher.approvalRequest(event.namespace, conversation.id, toApproval(storedApproval))
            this.publisher.state(event.namespace, conversation.id, await this.getState({
                namespace: event.namespace,
                userKey: conversation.userKey,
                conversationId: conversation.id
            }))
            return
        }

        if (event.type === 'approval-resolved') {
            const conversation = this.store.openclawConversations.getConversationByExternalId(
                event.namespace,
                event.conversationId
            ) ?? this.store.openclawConversations.getConversationByNamespace(event.conversationId, event.namespace)
            if (!conversation) {
                throw new Error('Conversation not found for approval resolution')
            }

            this.store.openclawApprovals.resolve(event.namespace, conversation.id, event.requestId, event.status)
            this.publisher.approvalResolved(event.namespace, conversation.id, event.requestId, event.status)
            this.publisher.state(event.namespace, conversation.id, await this.getState({
                namespace: event.namespace,
                userKey: conversation.userKey,
                conversationId: conversation.id
            }))
            return
        }

        const conversation = this.store.openclawConversations.getConversationByExternalId(
            event.namespace,
            event.conversationId
        ) ?? this.store.openclawConversations.getConversationByNamespace(event.conversationId, event.namespace)
        if (!conversation) {
            throw new Error('Conversation not found for state event')
        }

        const updatedConversation = this.store.openclawConversations.updateConversation(conversation.id, event.namespace, {
            connected: event.connected,
            thinking: event.thinking,
            lastError: event.lastError ?? null
        })
        if (!updatedConversation) {
            throw new Error('Conversation not found while updating state')
        }

        this.publisher.state(
            event.namespace,
            conversation.id,
            toState(
                updatedConversation,
                this.store.openclawApprovals.listPending(event.namespace, conversation.id).map(toApproval)
            )
        )
    }
}
