import type { PluginConfig } from './types'

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getPluginConfig(): PluginConfig {
    return {
        listenHost: process.env.OPENCLAW_PLUGIN_LISTEN_HOST?.trim() || '127.0.0.1',
        listenPort: parsePositiveInt(process.env.OPENCLAW_PLUGIN_LISTEN_PORT, 3016),
        sharedSecret: process.env.OPENCLAW_PLUGIN_SHARED_SECRET?.trim() || null,
        callbackBaseUrl: process.env.HAPI_CALLBACK_BASE_URL?.trim() || null,
        callbackSigningSecret: process.env.HAPI_CALLBACK_SIGNING_SECRET?.trim() || null,
        namespace: process.env.OPENCLAW_PLUGIN_NAMESPACE?.trim() || 'default'
    }
}
