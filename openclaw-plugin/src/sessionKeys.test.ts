import { describe, expect, it } from 'bun:test'
import {
    buildHapiConversationToken,
    buildHapiSessionKey,
    deriveDeterministicSessionId,
    parseHapiSessionKey,
    stripReplyToCurrentPrefix
} from './sessionKeys'

describe('sessionKeys', () => {
    it('builds and parses deterministic HAPI session keys', () => {
        const sessionKey = buildHapiSessionKey('default', ' debug/user@example.com ')

        expect(buildHapiConversationToken('default', ' debug/user@example.com ')).toBe(
            'hapi-openclaw:default:debug%2Fuser%40example.com'
        )
        expect(sessionKey).toBe('agent:main:hapi-openclaw:default:debug%2Fuser%40example.com')
        expect(parseHapiSessionKey(sessionKey)).toEqual({
            agentId: 'main',
            namespace: 'default',
            externalUserKey: 'debug/user@example.com'
        })
    })

    it('round-trips namespaces that contain colons', () => {
        const sessionKey = buildHapiSessionKey(' team:blue ', 'debug-user')

        expect(buildHapiConversationToken(' team:blue ', 'debug-user')).toBe(
            'hapi-openclaw:team%3Ablue:debug-user'
        )
        expect(sessionKey).toBe('agent:main:hapi-openclaw:team%3Ablue:debug-user')
        expect(parseHapiSessionKey(sessionKey)).toEqual({
            agentId: 'main',
            namespace: 'team:blue',
            externalUserKey: 'debug-user'
        })
    })

    it('derives a stable UUID-like session id', () => {
        const sessionId = deriveDeterministicSessionId('agent:main:hapi-openclaw:default:debug-user')

        expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        expect(deriveDeterministicSessionId('agent:main:hapi-openclaw:default:debug-user')).toBe(sessionId)
        expect(deriveDeterministicSessionId('agent:main:hapi-openclaw:default:other-user')).not.toBe(sessionId)
    })

    it('strips reply_to_current wrapper from assistant text', () => {
        expect(stripReplyToCurrentPrefix('[[reply_to_current]] hello world')).toBe('hello world')
        expect(stripReplyToCurrentPrefix('plain text')).toBe('plain text')
    })
})
