export type OpenClawTransportMode = 'fake' | 'official'

export type OpenClawTransportConfig = {
    mode: OpenClawTransportMode
    apiBaseUrl: string | null
    apiKey: string | null
    signingSecret: string | null
    legacyChannelToken: string | null
    timeoutMs: number
    allowedTimestampSkewMs: number
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }
    return parsed
}

export function getOpenClawTransportConfig(): OpenClawTransportConfig {
    const requestedMode = process.env.OPENCLAW_TRANSPORT_MODE?.trim().toLowerCase()
    const mode: OpenClawTransportMode = requestedMode === 'official' ? 'official' : 'fake'

    const apiBaseUrl = process.env.OPENCLAW_API_BASE_URL?.trim() || null
    const apiKey = process.env.OPENCLAW_API_KEY?.trim() || null
    const signingSecret = process.env.OPENCLAW_CHANNEL_SIGNING_SECRET?.trim() || null
    const legacyChannelToken = process.env.OPENCLAW_CHANNEL_TOKEN?.trim() || null

    return {
        mode,
        apiBaseUrl,
        apiKey,
        signingSecret,
        legacyChannelToken,
        timeoutMs: parsePositiveInt(process.env.OPENCLAW_CHANNEL_TIMEOUT_MS, 30_000),
        allowedTimestampSkewMs: parsePositiveInt(process.env.OPENCLAW_CHANNEL_ALLOWED_SKEW_MS, 300_000)
    }
}
