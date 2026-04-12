import type { OpenClawConfig } from 'openclaw/plugin-sdk/plugin-entry'
import type { PluginConfig } from './types'
import { OPENCLAW_PLUGIN_ID } from './pluginId'

export const PLUGIN_CONFIG_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        hapiBaseUrl: { type: 'string', minLength: 1 },
        sharedSecret: { type: 'string', minLength: 1 },
        namespace: { type: 'string', minLength: 1 },
        prototypeCaptureSessionKey: { type: 'string', minLength: 1 },
        prototypeCaptureFileName: { type: 'string', minLength: 1 }
    }
} as const

function readOptionalNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readRequiredString(value: unknown, fieldName: string): string {
    const parsed = readOptionalNonEmptyString(value)
    if (!parsed) {
        throw new Error(`Invalid ${OPENCLAW_PLUGIN_ID} config: ${fieldName} must be a non-empty string`)
    }
    return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resolvePluginConfig(value: unknown): PluginConfig {
    if (!isRecord(value)) {
        throw new Error(`Invalid ${OPENCLAW_PLUGIN_ID} config: expected an object`)
    }

    return {
        hapiBaseUrl: readRequiredString(value.hapiBaseUrl, 'hapiBaseUrl'),
        sharedSecret: readRequiredString(value.sharedSecret, 'sharedSecret'),
        namespace: readOptionalNonEmptyString(value.namespace) ?? 'default',
        prototypeCaptureSessionKey: readOptionalNonEmptyString(value.prototypeCaptureSessionKey),
        prototypeCaptureFileName: readOptionalNonEmptyString(value.prototypeCaptureFileName) ?? 'transcript-capture.jsonl'
    }
}

export function resolvePluginConfigFromOpenClawConfig(config: OpenClawConfig | undefined | null): PluginConfig | null {
    const pluginConfig = config?.plugins?.entries?.[OPENCLAW_PLUGIN_ID]?.config
    if (!pluginConfig) {
        return null
    }

    try {
        return resolvePluginConfig(pluginConfig)
    } catch {
        return null
    }
}
