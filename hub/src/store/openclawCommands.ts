import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type { StoredOpenClawCommand } from './types'

type DbOpenClawCommandRow = {
    id: string
    namespace: string
    conversation_id: string
    type: string
    local_message_id: string | null
    approval_request_id: string | null
    idempotency_key: string
    upstream_conversation_id: string | null
    upstream_request_id: string | null
    status: string
    last_error: string | null
    created_at: number
    updated_at: number
}

function toStoredCommand(row: DbOpenClawCommandRow): StoredOpenClawCommand {
    return {
        id: row.id,
        namespace: row.namespace,
        conversationId: row.conversation_id,
        type: row.type,
        localMessageId: row.local_message_id,
        approvalRequestId: row.approval_request_id,
        idempotencyKey: row.idempotency_key,
        upstreamConversationId: row.upstream_conversation_id,
        upstreamRequestId: row.upstream_request_id,
        status: row.status,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

export function createOpenClawCommand(
    db: Database,
    input: {
        namespace: string
        conversationId: string
        type: string
        localMessageId?: string | null
        approvalRequestId?: string | null
        idempotencyKey: string
        upstreamConversationId?: string | null
    }
): StoredOpenClawCommand {
    const id = randomUUID()
    const now = Date.now()

    db.prepare(`
        INSERT INTO openclaw_commands (
            id, namespace, conversation_id, type, local_message_id, approval_request_id,
            idempotency_key, upstream_conversation_id, upstream_request_id,
            status, last_error, created_at, updated_at
        ) VALUES (
            @id, @namespace, @conversation_id, @type, @local_message_id, @approval_request_id,
            @idempotency_key, @upstream_conversation_id, NULL,
            'queued', NULL, @created_at, @updated_at
        )
    `).run({
        id,
        namespace: input.namespace,
        conversation_id: input.conversationId,
        type: input.type,
        local_message_id: input.localMessageId ?? null,
        approval_request_id: input.approvalRequestId ?? null,
        idempotency_key: input.idempotencyKey,
        upstream_conversation_id: input.upstreamConversationId ?? null,
        created_at: now,
        updated_at: now
    })

    const row = db.prepare(
        'SELECT * FROM openclaw_commands WHERE id = ? LIMIT 1'
    ).get(id) as DbOpenClawCommandRow | undefined
    if (!row) {
        throw new Error('Failed to create OpenClaw command')
    }
    return toStoredCommand(row)
}

export function getOpenClawCommandByIdempotencyKey(
    db: Database,
    namespace: string,
    idempotencyKey: string
): StoredOpenClawCommand | null {
    const row = db.prepare(
        'SELECT * FROM openclaw_commands WHERE namespace = ? AND idempotency_key = ? LIMIT 1'
    ).get(namespace, idempotencyKey) as DbOpenClawCommandRow | undefined
    return row ? toStoredCommand(row) : null
}

export function updateOpenClawCommand(
    db: Database,
    id: string,
    namespace: string,
    patch: {
        status: string
        upstreamConversationId?: string | null
        upstreamRequestId?: string | null
        lastError?: string | null
    }
): StoredOpenClawCommand | null {
    const existing = db.prepare(
        'SELECT * FROM openclaw_commands WHERE id = ? AND namespace = ? LIMIT 1'
    ).get(id, namespace) as DbOpenClawCommandRow | undefined
    if (!existing) {
        return null
    }

    db.prepare(`
        UPDATE openclaw_commands
        SET status = @status,
            upstream_conversation_id = @upstream_conversation_id,
            upstream_request_id = @upstream_request_id,
            last_error = @last_error,
            updated_at = @updated_at
        WHERE id = @id
          AND namespace = @namespace
    `).run({
        id,
        namespace,
        status: patch.status,
        upstream_conversation_id: Object.prototype.hasOwnProperty.call(patch, 'upstreamConversationId')
            ? patch.upstreamConversationId ?? null
            : existing.upstream_conversation_id,
        upstream_request_id: Object.prototype.hasOwnProperty.call(patch, 'upstreamRequestId')
            ? patch.upstreamRequestId ?? null
            : existing.upstream_request_id,
        last_error: Object.prototype.hasOwnProperty.call(patch, 'lastError')
            ? patch.lastError ?? null
            : existing.last_error,
        updated_at: Date.now()
    })

    const row = db.prepare(
        'SELECT * FROM openclaw_commands WHERE id = ? LIMIT 1'
    ).get(id) as DbOpenClawCommandRow | undefined
    return row ? toStoredCommand(row) : null
}

export function getLatestOpenClawCommand(
    db: Database,
    namespace: string,
    conversationId: string
): StoredOpenClawCommand | null {
    const row = db.prepare(`
        SELECT * FROM openclaw_commands
        WHERE namespace = ? AND conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(namespace, conversationId) as DbOpenClawCommandRow | undefined
    return row ? toStoredCommand(row) : null
}
