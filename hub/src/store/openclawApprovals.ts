import type { Database } from 'bun:sqlite'

import type { StoredOpenClawApproval } from './types'

type DbApprovalRow = {
    id: string
    conversation_id: string
    namespace: string
    title: string
    description: string | null
    status: string
    created_at: number
    resolved_at: number | null
}

function toStoredApproval(row: DbApprovalRow): StoredOpenClawApproval {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        namespace: row.namespace,
        title: row.title,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at
    }
}

export function upsertOpenClawApproval(
    db: Database,
    input: {
        id: string
        conversationId: string
        namespace: string
        title: string
        description?: string | null
        status?: string
        createdAt?: number
        resolvedAt?: number | null
    }
): StoredOpenClawApproval {
    const existing = db.prepare(
        'SELECT * FROM openclaw_approvals WHERE id = ? AND namespace = ? LIMIT 1'
    ).get(input.id, input.namespace) as DbApprovalRow | undefined

    if (!existing) {
        db.prepare(`
            INSERT INTO openclaw_approvals (
                id, conversation_id, namespace, title, description, status, created_at, resolved_at
            ) VALUES (
                @id, @conversation_id, @namespace, @title, @description, @status, @created_at, @resolved_at
            )
        `).run({
            id: input.id,
            conversation_id: input.conversationId,
            namespace: input.namespace,
            title: input.title,
            description: input.description ?? null,
            status: input.status ?? 'pending',
            created_at: input.createdAt ?? Date.now(),
            resolved_at: input.resolvedAt ?? null
        })
    } else {
        db.prepare(`
            UPDATE openclaw_approvals
            SET title = @title,
                description = @description,
                status = @status,
                resolved_at = @resolved_at
            WHERE id = @id
              AND namespace = @namespace
        `).run({
            id: input.id,
            namespace: input.namespace,
            title: input.title,
            description: input.description ?? existing.description,
            status: input.status ?? existing.status,
            resolved_at: Object.prototype.hasOwnProperty.call(input, 'resolvedAt')
                ? input.resolvedAt ?? null
                : existing.resolved_at
        })
    }

    const row = db.prepare(
        'SELECT * FROM openclaw_approvals WHERE id = ? AND namespace = ? LIMIT 1'
    ).get(input.id, input.namespace) as DbApprovalRow | undefined
    if (!row) {
        throw new Error('Failed to store OpenClaw approval')
    }
    return toStoredApproval(row)
}

export function listPendingOpenClawApprovals(
    db: Database,
    namespace: string,
    conversationId: string
): StoredOpenClawApproval[] {
    const rows = db.prepare(`
        SELECT * FROM openclaw_approvals
        WHERE namespace = ? AND conversation_id = ? AND status = 'pending'
        ORDER BY created_at ASC
    `).all(namespace, conversationId) as DbApprovalRow[]
    return rows.map(toStoredApproval)
}

export function resolveOpenClawApproval(
    db: Database,
    namespace: string,
    conversationId: string,
    id: string,
    status: 'approved' | 'denied'
): StoredOpenClawApproval | null {
    const result = db.prepare(`
        UPDATE openclaw_approvals
        SET status = @status,
            resolved_at = @resolved_at
        WHERE id = @id
          AND namespace = @namespace
          AND conversation_id = @conversation_id
    `).run({
        id,
        namespace,
        conversation_id: conversationId,
        status,
        resolved_at: Date.now()
    })

    if (result.changes !== 1) {
        return null
    }

    const row = db.prepare(
        'SELECT * FROM openclaw_approvals WHERE id = ? AND namespace = ? LIMIT 1'
    ).get(id, namespace) as DbApprovalRow | undefined
    return row ? toStoredApproval(row) : null
}
