import type {
    OpenClawApprovalRequest,
    OpenClawConversationSummary,
    OpenClawMessage,
    OpenClawState
} from '@hapi/protocol/types'

export type OpenClawMessagePage = {
    messages: OpenClawMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type OpenClawInboundEvent =
    | {
        type: 'message'
        namespace: string
        conversationId: string
        role?: 'user' | 'assistant' | 'system'
        text: string
        externalMessageId?: string
        createdAt?: number
        status?: 'streaming' | 'completed' | 'failed'
    }
    | {
        type: 'approval-request'
        namespace: string
        conversationId: string
        requestId: string
        title: string
        description?: string
        createdAt?: number
    }
    | {
        type: 'approval-resolved'
        namespace: string
        conversationId: string
        requestId: string
        status: 'approved' | 'denied'
    }
    | {
        type: 'state'
        namespace: string
        conversationId: string
        connected: boolean
        thinking: boolean
        lastError?: string | null
    }

export type OpenClawSendResult = {
    externalMessageId?: string | null
    assistantMessages?: Array<{
        externalMessageId?: string | null
        text: string
        createdAt?: number
        status?: 'streaming' | 'completed' | 'failed'
    }>
    approvals?: Array<{
        id: string
        title: string
        description?: string
        createdAt?: number
    }>
}

export type OpenClawApprovalResolutionResult = {
    assistantMessage?: {
        externalMessageId?: string | null
        text: string
        createdAt?: number
    }
}

export interface OpenClawChatService {
    getOrCreateDefaultConversation(input: { namespace: string; userKey: string }): Promise<OpenClawConversationSummary>
    verifyConversationAccess(input: { namespace: string; userKey: string; conversationId: string }): Promise<boolean>
    listMessages(input: {
        namespace: string
        userKey: string
        conversationId: string
        beforeSeq?: number | null
        limit: number
    }): Promise<OpenClawMessagePage>
    getState(input: { namespace: string; userKey: string; conversationId: string }): Promise<OpenClawState>
    sendMessage(input: {
        namespace: string
        conversationId: string
        userKey: string
        text: string
    }): Promise<OpenClawMessage>
    approve(input: { namespace: string; userKey: string; conversationId: string; requestId: string }): Promise<void>
    deny(input: { namespace: string; userKey: string; conversationId: string; requestId: string }): Promise<void>
    ingestInboundEvent(event: OpenClawInboundEvent): Promise<void>
}

export type OpenClawConversationView = {
    conversation: OpenClawConversationSummary
    state: OpenClawState
    messages: OpenClawMessage[]
    approvals: OpenClawApprovalRequest[]
}
