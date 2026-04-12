import { describe, expect, it } from 'bun:test'
import entry from './index'

describe('native plugin entry', () => {
    it('registers the native route surface and capture service in full mode', () => {
        const httpRoutes: Array<{ path: string; match?: string; auth: string }> = []
        const services: Array<{ id: string }> = []

        ;(entry as unknown as { register: (api: Record<string, unknown>) => void }).register({
            registrationMode: 'full',
            pluginConfig: {
                hapiBaseUrl: 'http://127.0.0.1:3006',
                sharedSecret: 'shared-secret'
            },
            runtime: {
                events: {
                    onSessionTranscriptUpdate() {
                        return () => {}
                    }
                }
            },
            registerHttpRoute(route: { path: string; match?: string; auth: string }) {
                httpRoutes.push(route)
            },
            registerService(service: { id: string }) {
                services.push(service)
            }
        })

        expect(httpRoutes).toHaveLength(1)
        expect(httpRoutes[0]).toMatchObject({
            path: '/hapi',
            auth: 'plugin',
            match: 'prefix'
        })
        expect(services).toHaveLength(2)
        expect(services[0]).toMatchObject({
            id: 'hapi-openclaw:transcript-bridge'
        })
        expect(services[1]).toMatchObject({
            id: 'hapi-openclaw:transcript-capture'
        })
    })

    it('falls back to global OpenClaw config when api.pluginConfig is empty', () => {
        const httpRoutes: Array<{ path: string; match?: string; auth: string }> = []
        const services: Array<{ id: string }> = []

        ;(entry as unknown as { register: (api: Record<string, unknown>) => void }).register({
            registrationMode: 'full',
            pluginConfig: {},
            config: {
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
            },
            runtime: {
                events: {
                    onSessionTranscriptUpdate() {
                        return () => {}
                    }
                }
            },
            registerHttpRoute(route: { path: string; match?: string; auth: string }) {
                httpRoutes.push(route)
            },
            registerService(service: { id: string }) {
                services.push(service)
            }
        })

        expect(httpRoutes).toHaveLength(1)
        expect(services).toHaveLength(2)
    })

    it('prefers runtime config when loader snapshots do not include plugin config', () => {
        const httpRoutes: Array<{ path: string; match?: string; auth: string }> = []
        const services: Array<{ id: string }> = []

        ;(entry as unknown as { register: (api: Record<string, unknown>) => void }).register({
            registrationMode: 'full',
            pluginConfig: {},
            config: {},
            runtime: {
                config: {
                    loadConfig() {
                        return {
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
                        }
                    }
                },
                events: {
                    onSessionTranscriptUpdate() {
                        return () => {}
                    }
                }
            },
            registerHttpRoute(route: { path: string; match?: string; auth: string }) {
                httpRoutes.push(route)
            },
            registerService(service: { id: string }) {
                services.push(service)
            }
        })

        expect(httpRoutes).toHaveLength(1)
        expect(services).toHaveLength(2)
    })
})
