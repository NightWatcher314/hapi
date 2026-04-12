import { createHash } from 'node:crypto'

const HAPI_SESSION_PREFIX = 'hapi-openclaw'
const DEFAULT_AGENT_ID = 'main'
const REPLY_TO_CURRENT_PREFIX = '[[reply_to_current]]'

export type ParsedHapiSessionKey = {
    agentId: string
    namespace: string
    externalUserKey: string
}

function encodeSessionKeyPart(value: string, fieldName: string): string {
    const normalized = value.trim()
    if (!normalized) {
        throw new Error(`${fieldName} must be a non-empty string`)
    }

    return encodeURIComponent(normalized)
}

function encodeUserKey(externalUserKey: string): string {
    return encodeSessionKeyPart(externalUserKey, 'externalUserKey')
}

function encodeNamespace(namespace: string): string {
    return encodeSessionKeyPart(namespace, 'namespace')
}

export function getDefaultAgentId(): string {
    return DEFAULT_AGENT_ID
}

export function buildHapiConversationToken(namespace: string, externalUserKey: string): string {
    return `${HAPI_SESSION_PREFIX}:${encodeNamespace(namespace)}:${encodeUserKey(externalUserKey)}`
}

export function buildHapiSessionKey(namespace: string, externalUserKey: string, agentId = DEFAULT_AGENT_ID): string {
    return `agent:${agentId}:${buildHapiConversationToken(namespace, externalUserKey)}`
}

export function parseHapiSessionKey(sessionKey: string | undefined | null): ParsedHapiSessionKey | null {
    if (!sessionKey) {
        return null
    }

    const match = /^agent:([^:]+):hapi-openclaw:([^:]+):(.+)$/.exec(sessionKey.trim())
    if (!match) {
        return null
    }

    try {
        return {
            agentId: match[1],
            namespace: decodeURIComponent(match[2]),
            externalUserKey: decodeURIComponent(match[3])
        }
    } catch {
        return null
    }
}

export function isHapiSessionKey(sessionKey: string | undefined | null): boolean {
    return parseHapiSessionKey(sessionKey) !== null
}

export function deriveDeterministicSessionId(sessionKey: string): string {
    const hex = createHash('sha256')
        .update(sessionKey)
        .digest('hex')
        .slice(0, 32)

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join('-')
}

export function stripReplyToCurrentPrefix(text: string): string {
    return text.replace(new RegExp(`^${REPLY_TO_CURRENT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '').trim()
}
