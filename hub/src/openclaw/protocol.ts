import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { OpenClawInboundEvent, OpenClawMessageContentUpdate } from './types'

type SignatureVerificationResult =
    | { ok: true }
    | { ok: false; reason: string }

const messageContentSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('replace'),
        text: z.string()
    }),
    z.object({
        mode: z.literal('append'),
        delta: z.string()
    })
])

const directEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('message'),
        eventId: z.string().min(1).optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1).optional(),
        conversationId: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']).optional(),
        externalMessageId: z.string().min(1).optional(),
        text: z.string().optional(),
        content: messageContentSchema.optional(),
        createdAt: z.number().optional(),
        status: z.enum(['streaming', 'completed', 'failed']).optional()
    }),
    z.object({
        type: z.literal('approval-request'),
        eventId: z.string().min(1).optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1).optional(),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        createdAt: z.number().optional()
    }),
    z.object({
        type: z.literal('approval-resolved'),
        eventId: z.string().min(1).optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1).optional(),
        conversationId: z.string().min(1),
        requestId: z.string().min(1),
        status: z.enum(['approved', 'denied'])
    }),
    z.object({
        type: z.literal('state'),
        eventId: z.string().min(1).optional(),
        occurredAt: z.number().optional(),
        namespace: z.string().min(1).optional(),
        conversationId: z.string().min(1),
        connected: z.boolean(),
        thinking: z.boolean(),
        lastError: z.string().nullable().optional()
    })
])

const officialEnvelopeSchema = z.object({
    id: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    timestamp: z.number().optional(),
    occurredAt: z.number().optional(),
    type: z.string().min(1),
    namespace: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
    data: z.record(z.string(), z.unknown()).optional()
})

function normalizeSignature(signatureHeader: string): string {
    const trimmed = signatureHeader.trim()
    return trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed
}

function buildContentUpdate(input: {
    content?: OpenClawMessageContentUpdate
    text?: string
}): OpenClawMessageContentUpdate {
    if (input.content) {
        return input.content
    }
    return {
        mode: 'replace',
        text: input.text ?? ''
    }
}

export function verifyOfficialOpenClawSignature(input: {
    headers: Headers
    rawBody: string
    signingSecret: string
    now: number
    allowedTimestampSkewMs: number
}): SignatureVerificationResult {
    const signatureHeader = input.headers.get('x-openclaw-signature')
        ?? input.headers.get('x-openclaw-signature-256')
    const timestampHeader = input.headers.get('x-openclaw-timestamp')

    if (!signatureHeader) {
        return { ok: false, reason: 'Missing signature header' }
    }
    if (!timestampHeader) {
        return { ok: false, reason: 'Missing timestamp header' }
    }

    const timestamp = Number.parseInt(timestampHeader, 10)
    if (!Number.isFinite(timestamp)) {
        return { ok: false, reason: 'Invalid timestamp header' }
    }

    if (Math.abs(input.now - timestamp) > input.allowedTimestampSkewMs) {
        return { ok: false, reason: 'Timestamp outside allowed skew' }
    }

    const payload = `${timestamp}.${input.rawBody}`
    const expected = createHmac('sha256', input.signingSecret)
        .update(payload)
        .digest('hex')
    const provided = normalizeSignature(signatureHeader)

    const expectedBuffer = Buffer.from(expected)
    const providedBuffer = Buffer.from(provided)
    if (expectedBuffer.length !== providedBuffer.length) {
        return { ok: false, reason: 'Invalid signature' }
    }

    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
        return { ok: false, reason: 'Invalid signature' }
    }

    return { ok: true }
}

export function parseOfficialOpenClawEvent(input: {
    rawBody: string
    now?: number
    defaultNamespace?: string | null
    namespaceResolver?: (conversationId: string) => string | null
}): OpenClawInboundEvent {
    const raw = JSON.parse(input.rawBody) as unknown
    const direct = directEventSchema.safeParse(raw)

    if (direct.success) {
        return normalizeDirectEvent(direct.data, input.now ?? Date.now(), input.defaultNamespace, input.namespaceResolver)
    }

    const parsedEnvelope = officialEnvelopeSchema.safeParse(raw)
    if (!parsedEnvelope.success) {
        throw new Error('Invalid OpenClaw event body')
    }

    const envelope = parsedEnvelope.data
    const data = envelope.data ?? {}
    const conversationId = typeof envelope.conversationId === 'string'
        ? envelope.conversationId
        : typeof data.conversationId === 'string'
            ? data.conversationId
            : typeof data.threadId === 'string'
                ? data.threadId
                : null

    if (!conversationId) {
        throw new Error('OpenClaw event is missing conversationId')
    }

    const namespace = resolveNamespace(
        envelope.namespace ?? (typeof data.namespace === 'string' ? data.namespace : undefined),
        conversationId,
        input.defaultNamespace,
        input.namespaceResolver
    )

    const eventId = envelope.eventId ?? envelope.id
    if (!eventId) {
        throw new Error('OpenClaw event is missing eventId')
    }

    const occurredAt = envelope.occurredAt ?? envelope.timestamp ?? input.now ?? Date.now()

    switch (envelope.type) {
        case 'message':
            return {
                type: 'message',
                eventId,
                occurredAt,
                namespace,
                conversationId,
                role: readStringEnum(data.role, ['user', 'assistant', 'system']),
                externalMessageId: readString(data.externalMessageId, data.messageId) ?? eventId,
                content: buildContentUpdate({
                    content: parseContentObject(data.content),
                    text: readString(data.text, data.delta, data.body) ?? ''
                }),
                createdAt: readNumber(data.createdAt, data.timestamp),
                status: readStringEnum(data.status, ['streaming', 'completed', 'failed'])
            }
        case 'approval-request':
            return {
                type: 'approval-request',
                eventId,
                occurredAt,
                namespace,
                conversationId,
                requestId: readRequiredString(data.requestId, data.approvalId),
                title: readRequiredString(data.title, data.name),
                description: readString(data.description, data.reason),
                createdAt: readNumber(data.createdAt, data.timestamp)
            }
        case 'approval-resolved':
            return {
                type: 'approval-resolved',
                eventId,
                occurredAt,
                namespace,
                conversationId,
                requestId: readRequiredString(data.requestId, data.approvalId),
                status: readRequiredEnum(data.status, ['approved', 'denied'])
            }
        case 'state':
            return {
                type: 'state',
                eventId,
                occurredAt,
                namespace,
                conversationId,
                connected: readRequiredBoolean(data.connected),
                thinking: readRequiredBoolean(data.thinking),
                lastError: readNullableString(data.lastError, data.error)
            }
        default:
            throw new Error(`Unsupported OpenClaw event type: ${envelope.type}`)
    }
}

function normalizeDirectEvent(
    event: z.infer<typeof directEventSchema>,
    now: number,
    defaultNamespace: string | null | undefined,
    namespaceResolver: ((conversationId: string) => string | null) | undefined
): OpenClawInboundEvent {
    const namespace = resolveNamespace(event.namespace, event.conversationId, defaultNamespace, namespaceResolver)
    const eventId = event.eventId ?? `dev-${now}-${Math.random().toString(36).slice(2)}`
    const occurredAt = event.occurredAt ?? now

    if (event.type === 'message') {
        return {
            type: 'message',
            eventId,
            occurredAt,
            namespace,
            conversationId: event.conversationId,
            role: event.role,
            externalMessageId: event.externalMessageId ?? eventId,
            content: buildContentUpdate({ content: event.content, text: event.text }),
            createdAt: event.createdAt,
            status: event.status
        }
    }

    if (event.type === 'approval-request') {
        return {
            ...event,
            eventId,
            occurredAt,
            namespace
        }
    }

    if (event.type === 'approval-resolved') {
        return {
            ...event,
            eventId,
            occurredAt,
            namespace
        }
    }

    return {
        ...event,
        eventId,
        occurredAt,
        namespace
    }
}

function resolveNamespace(
    explicitNamespace: string | undefined,
    conversationId: string,
    defaultNamespace: string | null | undefined,
    namespaceResolver: ((conversationId: string) => string | null) | undefined
): string {
    const resolved = explicitNamespace
        ?? defaultNamespace
        ?? namespaceResolver?.(conversationId)
    if (!resolved) {
        throw new Error('OpenClaw event is missing namespace')
    }
    return resolved
}

function readString(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) {
            return value
        }
    }
    return undefined
}

function readRequiredString(...values: unknown[]): string {
    const value = readString(...values)
    if (!value) {
        throw new Error('Missing required string field')
    }
    return value
}

function readNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
    }
    return undefined
}

function readRequiredBoolean(value: unknown): boolean {
    if (typeof value !== 'boolean') {
        throw new Error('Missing required boolean field')
    }
    return value
}

function readNullableString(...values: unknown[]): string | null | undefined {
    for (const value of values) {
        if (value === null) {
            return null
        }
        if (typeof value === 'string') {
            return value
        }
    }
    return undefined
}

function readStringEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
    return typeof value === 'string' && allowed.includes(value as T) ? value as T : undefined
}

function readRequiredEnum<T extends string>(value: unknown, allowed: T[]): T {
    const resolved = readStringEnum(value, allowed)
    if (!resolved) {
        throw new Error('Missing required enum field')
    }
    return resolved
}

function parseContentObject(value: unknown): OpenClawMessageContentUpdate | undefined {
    const parsed = messageContentSchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
}
