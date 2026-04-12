import { describe, expect, it } from 'bun:test'
import { resolvePluginConfig, resolvePluginConfigFromOpenClawConfig } from './config'

describe('resolvePluginConfig', () => {
    it('reads the plugin config object', () => {
        expect(resolvePluginConfig({
            sharedSecret: 'shared-secret',
            hapiBaseUrl: 'http://127.0.0.1:3006',
            namespace: 'default',
            prototypeCaptureSessionKey: 'session-1'
        })).toEqual({
            sharedSecret: 'shared-secret',
            hapiBaseUrl: 'http://127.0.0.1:3006',
            namespace: 'default',
            prototypeCaptureSessionKey: 'session-1',
            prototypeCaptureFileName: 'transcript-capture.jsonl'
        })
    })

    it('fails clearly when the shared secret is missing', () => {
        expect(() => resolvePluginConfig({
            hapiBaseUrl: 'http://127.0.0.1:3006'
        })).toThrow('sharedSecret')
    })

    it('reads plugin config from the global OpenClaw config shape', () => {
        expect(resolvePluginConfigFromOpenClawConfig({
            plugins: {
                entries: {
                    'hapi-openclaw': {
                        config: {
                            hapiBaseUrl: 'http://127.0.0.1:3006',
                            sharedSecret: 'shared-secret'
                        }
                    }
                }
            }
        })).toEqual({
            sharedSecret: 'shared-secret',
            hapiBaseUrl: 'http://127.0.0.1:3006',
            namespace: 'default',
            prototypeCaptureSessionKey: null,
            prototypeCaptureFileName: 'transcript-capture.jsonl'
        })
    })
})
