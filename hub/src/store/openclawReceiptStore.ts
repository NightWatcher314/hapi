import type { Database } from 'bun:sqlite'

import type { StoredOpenClawReceipt } from './types'
import {
    getOpenClawReceipt,
    markOpenClawReceiptProcessed,
    recordOpenClawReceipt
} from './openclawReceipts'

export class OpenClawReceiptStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getReceipt(namespace: string, eventId: string): StoredOpenClawReceipt | null {
        return getOpenClawReceipt(this.db, namespace, eventId)
    }

    hasProcessedReceipt(namespace: string, eventId: string): boolean {
        const receipt = getOpenClawReceipt(this.db, namespace, eventId)
        return Boolean(receipt?.processedAt)
    }

    recordReceipt(input: {
        namespace: string
        eventId: string
        upstreamConversationId?: string | null
        eventType: string
    }): StoredOpenClawReceipt {
        return recordOpenClawReceipt(this.db, input)
    }

    markProcessed(namespace: string, eventId: string): StoredOpenClawReceipt | null {
        return markOpenClawReceiptProcessed(this.db, namespace, eventId)
    }
}
