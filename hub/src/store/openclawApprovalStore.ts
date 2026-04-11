import type { Database } from 'bun:sqlite'

import type { StoredOpenClawApproval } from './types'
import { listPendingOpenClawApprovals, resolveOpenClawApproval, upsertOpenClawApproval } from './openclawApprovals'

export class OpenClawApprovalStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    upsertApproval(input: {
        id: string
        conversationId: string
        namespace: string
        title: string
        description?: string | null
        status?: string
        createdAt?: number
        resolvedAt?: number | null
    }): StoredOpenClawApproval {
        return upsertOpenClawApproval(this.db, input)
    }

    listPending(namespace: string, conversationId: string): StoredOpenClawApproval[] {
        return listPendingOpenClawApprovals(this.db, namespace, conversationId)
    }

    resolve(
        namespace: string,
        conversationId: string,
        id: string,
        status: 'approved' | 'denied'
    ): StoredOpenClawApproval | null {
        return resolveOpenClawApproval(this.db, namespace, conversationId, id, status)
    }
}
