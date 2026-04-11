import type { Database } from 'bun:sqlite'

import type { StoredOpenClawMessage } from './types'
import { addOpenClawMessage, getOpenClawMaxSeq, getOpenClawMessages } from './openclawMessages'

export class OpenClawMessageStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    addMessage(input: {
        conversationId: string
        namespace: string
        externalId?: string | null
        role: string
        text: string
        createdAt?: number
        status?: string | null
    }): StoredOpenClawMessage {
        return addOpenClawMessage(this.db, input)
    }

    getMessages(
        namespace: string,
        conversationId: string,
        limit: number = 50,
        beforeSeq?: number | null
    ): StoredOpenClawMessage[] {
        return getOpenClawMessages(this.db, namespace, conversationId, limit, beforeSeq)
    }

    getMaxSeq(conversationId: string): number {
        return getOpenClawMaxSeq(this.db, conversationId)
    }
}
