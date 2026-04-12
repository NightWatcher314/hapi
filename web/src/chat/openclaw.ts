import type { OpenClawMessage } from '@hapi/protocol/types'
import type { ChatBlock } from '@/chat/types'
import type { MessageStatus } from '@/types/api'

function toUserStatus(status: OpenClawMessage['status']): MessageStatus | undefined {
    if (status === 'failed') {
        return 'failed'
    }
    if (status === 'completed') {
        return 'sent'
    }
    return undefined
}

export function openClawMessagesToChatBlocks(messages: OpenClawMessage[]): ChatBlock[] {
    return messages.map((message) => {
        if (message.role === 'user') {
            return {
                kind: 'user-text',
                id: message.id,
                localId: null,
                createdAt: message.createdAt,
                text: message.text,
                status: toUserStatus(message.status)
            } satisfies ChatBlock
        }

        return {
            kind: 'agent-text',
            id: message.id,
            localId: null,
            createdAt: message.createdAt,
            text: message.text,
            meta: {
                openclawRole: message.role,
                openclawStatus: message.status ?? null
            }
        } satisfies ChatBlock
    })
}
