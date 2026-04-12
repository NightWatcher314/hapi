import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type { OpenClawMessageContentUpdate } from '../openclaw/types'
import type { StoredOpenClawMessage } from './types'

type DbMessageRow = {
    id: string
    conversation_id: string
    namespace: string
    external_id: string | null
    role: string
    text: string
    created_at: number
    seq: number
    status: string | null
}

function toStoredMessage(row: DbMessageRow): StoredOpenClawMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        namespace: row.namespace,
        externalId: row.external_id,
        role: row.role,
        text: row.text,
        createdAt: row.created_at,
        seq: row.seq,
        status: row.status
    }
}

export function addOpenClawMessage(
    db: Database,
    input: {
        conversationId: string
        namespace: string
        externalId?: string | null
        role: string
        text: string
        createdAt?: number
        status?: string | null
    }
): StoredOpenClawMessage {
    if (input.externalId) {
        const existing = db.prepare(
            'SELECT * FROM openclaw_messages WHERE conversation_id = ? AND external_id = ? LIMIT 1'
        ).get(input.conversationId, input.externalId) as DbMessageRow | undefined
        if (existing) {
            db.prepare(`
                UPDATE openclaw_messages
                SET role = @role,
                    text = @text,
                    created_at = @created_at,
                    status = @status
                WHERE id = @id
            `).run({
                id: existing.id,
                role: input.role,
                text: input.text,
                created_at: input.createdAt ?? existing.created_at,
                status: input.status ?? existing.status
            })

            const updated = db.prepare(
                'SELECT * FROM openclaw_messages WHERE id = ? LIMIT 1'
            ).get(existing.id) as DbMessageRow | undefined
            if (!updated) {
                throw new Error('Failed to update OpenClaw message')
            }
            return toStoredMessage(updated)
        }
    }

    const createdAt = input.createdAt ?? Date.now()
    const seqRow = db.prepare(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM openclaw_messages WHERE conversation_id = ?'
    ).get(input.conversationId) as { nextSeq: number }
    const id = randomUUID()

    db.prepare(`
        INSERT INTO openclaw_messages (
            id, conversation_id, namespace, external_id, role, text, created_at, seq, status
        ) VALUES (
            @id, @conversation_id, @namespace, @external_id, @role, @text, @created_at, @seq, @status
        )
    `).run({
        id,
        conversation_id: input.conversationId,
        namespace: input.namespace,
        external_id: input.externalId ?? null,
        role: input.role,
        text: input.text,
        created_at: createdAt,
        seq: seqRow.nextSeq,
        status: input.status ?? 'completed'
    })

    const row = db.prepare(
        'SELECT * FROM openclaw_messages WHERE id = ? LIMIT 1'
    ).get(id) as DbMessageRow | undefined
    if (!row) {
        throw new Error('Failed to create OpenClaw message')
    }
    return toStoredMessage(row)
}

export function appendOrReplaceOpenClawMessageContent(
    db: Database,
    input: {
        conversationId: string
        namespace: string
        externalId: string
        role: string
        content: OpenClawMessageContentUpdate
        createdAt?: number
        status?: string | null
    }
): StoredOpenClawMessage {
    const existing = db.prepare(
        'SELECT * FROM openclaw_messages WHERE conversation_id = ? AND external_id = ? LIMIT 1'
    ).get(input.conversationId, input.externalId) as DbMessageRow | undefined

    if (!existing) {
        return addOpenClawMessage(db, {
            conversationId: input.conversationId,
            namespace: input.namespace,
            externalId: input.externalId,
            role: input.role,
            text: input.content.mode === 'append' ? input.content.delta : input.content.text,
            createdAt: input.createdAt,
            status: input.status
        })
    }

    const nextText = input.content.mode === 'append'
        ? `${existing.text}${input.content.delta}`
        : input.content.text

    db.prepare(`
        UPDATE openclaw_messages
        SET role = @role,
            text = @text,
            created_at = @created_at,
            status = @status
        WHERE id = @id
    `).run({
        id: existing.id,
        role: input.role,
        text: nextText,
        created_at: input.createdAt ?? existing.created_at,
        status: input.status ?? existing.status
    })

    const updated = db.prepare(
        'SELECT * FROM openclaw_messages WHERE id = ? LIMIT 1'
    ).get(existing.id) as DbMessageRow | undefined
    if (!updated) {
        throw new Error('Failed to update OpenClaw message content')
    }
    return toStoredMessage(updated)
}

export function getOpenClawMessages(
    db: Database,
    namespace: string,
    conversationId: string,
    limit: number = 50,
    beforeSeq?: number | null
): StoredOpenClawMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50
    const rows = beforeSeq && Number.isFinite(beforeSeq)
        ? db.prepare(`
            SELECT * FROM openclaw_messages
            WHERE namespace = ? AND conversation_id = ? AND seq < ?
            ORDER BY seq DESC
            LIMIT ?
        `).all(namespace, conversationId, beforeSeq, safeLimit) as DbMessageRow[]
        : db.prepare(`
            SELECT * FROM openclaw_messages
            WHERE namespace = ? AND conversation_id = ?
            ORDER BY seq DESC
            LIMIT ?
        `).all(namespace, conversationId, safeLimit) as DbMessageRow[]

    return rows.reverse().map(toStoredMessage)
}

export function getOpenClawMaxSeq(db: Database, conversationId: string): number {
    const row = db.prepare(
        'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM openclaw_messages WHERE conversation_id = ?'
    ).get(conversationId) as { maxSeq: number } | undefined
    return row?.maxSeq ?? 0
}
