import type { Database } from 'bun:sqlite'

import type { StoredOpenClawCommand } from './types'
import {
    createOpenClawCommand,
    getOpenClawCommandByIdempotencyKey,
    getLatestOpenClawCommand,
    updateOpenClawCommand
} from './openclawCommands'

export class OpenClawCommandStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    createCommand(input: {
        namespace: string
        conversationId: string
        type: string
        localMessageId?: string | null
        approvalRequestId?: string | null
        idempotencyKey: string
        upstreamConversationId?: string | null
    }): StoredOpenClawCommand {
        return createOpenClawCommand(this.db, input)
    }

    getCommandByIdempotencyKey(namespace: string, idempotencyKey: string): StoredOpenClawCommand | null {
        return getOpenClawCommandByIdempotencyKey(this.db, namespace, idempotencyKey)
    }

    getLatestCommand(namespace: string, conversationId: string): StoredOpenClawCommand | null {
        return getLatestOpenClawCommand(this.db, namespace, conversationId)
    }

    markAccepted(input: {
        id: string
        namespace: string
        upstreamConversationId?: string | null
        upstreamRequestId?: string | null
    }): StoredOpenClawCommand | null {
        return updateOpenClawCommand(this.db, input.id, input.namespace, {
            status: 'accepted',
            upstreamConversationId: input.upstreamConversationId,
            upstreamRequestId: input.upstreamRequestId,
            lastError: null
        })
    }

    markFailed(input: {
        id: string
        namespace: string
        lastError: string
    }): StoredOpenClawCommand | null {
        return updateOpenClawCommand(this.db, input.id, input.namespace, {
            status: 'failed',
            lastError: input.lastError
        })
    }
}
