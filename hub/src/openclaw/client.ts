import { randomUUID } from 'node:crypto'

import type { OpenClawApprovalResolutionResult, OpenClawSendResult } from './types'

export interface OpenClawClient {
    ensureDefaultConversation(input: { externalUserKey: string }): Promise<{ conversationId: string; title?: string | null }>
    sendMessage(input: { conversationId: string; text: string }): Promise<OpenClawSendResult>
    approve(input: { requestId: string }): Promise<OpenClawApprovalResolutionResult>
    deny(input: { requestId: string }): Promise<OpenClawApprovalResolutionResult>
}

class FakeOpenClawClient implements OpenClawClient {
    async ensureDefaultConversation(input: { externalUserKey: string }): Promise<{ conversationId: string; title?: string | null }> {
        return {
            conversationId: `openclaw:${input.externalUserKey}`,
            title: 'OpenClaw'
        }
    }

    async sendMessage(input: { conversationId: string; text: string }): Promise<OpenClawSendResult> {
        const trimmed = input.text.trim()

        if (trimmed.toLowerCase().includes('approval')) {
            const requestId = randomUUID()
            return {
                externalMessageId: randomUUID(),
                assistantMessages: [{
                    externalMessageId: randomUUID(),
                    text: `OpenClaw received your request in ${input.conversationId}. Approval is now required before continuing.`
                }],
                approvals: [{
                    id: requestId,
                    title: 'Approve OpenClaw action',
                    description: trimmed
                }]
            }
        }

        return {
            externalMessageId: randomUUID(),
            assistantMessages: [{
                externalMessageId: randomUUID(),
                text: `OpenClaw echo: ${trimmed || '(empty message)'}`
            }]
        }
    }

    async approve(input: { requestId: string }): Promise<OpenClawApprovalResolutionResult> {
        return {
            assistantMessage: {
                externalMessageId: randomUUID(),
                text: `OpenClaw approval ${input.requestId} approved.`
            }
        }
    }

    async deny(input: { requestId: string }): Promise<OpenClawApprovalResolutionResult> {
        return {
            assistantMessage: {
                externalMessageId: randomUUID(),
                text: `OpenClaw approval ${input.requestId} denied.`
            }
        }
    }
}

export function createOpenClawClient(): OpenClawClient {
    return new FakeOpenClawClient()
}
