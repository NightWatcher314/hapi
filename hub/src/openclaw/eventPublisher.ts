import type { OpenClawApprovalRequest, OpenClawMessage, OpenClawState, OpenClawSyncEvent } from '@hapi/protocol/types'
import type { SSEManager } from '../sse/sseManager'

export class OpenClawEventPublisher {
    constructor(private readonly sseManager: SSEManager) {}

    emit(event: OpenClawSyncEvent & { namespace: string }): void {
        this.sseManager.broadcast(event)
    }

    message(namespace: string, conversationId: string, message: OpenClawMessage): void {
        this.emit({ type: 'openclaw-message', namespace, conversationId, message })
    }

    state(namespace: string, conversationId: string, state: OpenClawState): void {
        this.emit({ type: 'openclaw-state', namespace, conversationId, state })
    }

    approvalRequest(namespace: string, conversationId: string, request: OpenClawApprovalRequest): void {
        this.emit({ type: 'openclaw-approval-request', namespace, conversationId, request })
    }

    approvalResolved(
        namespace: string,
        conversationId: string,
        requestId: string,
        status: 'approved' | 'denied'
    ): void {
        this.emit({ type: 'openclaw-approval-resolved', namespace, conversationId, requestId, status })
    }
}
