import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenClawPluginService, OpenClawPluginServiceContext } from 'openclaw/plugin-sdk/plugin-entry'
import { OPENCLAW_PLUGIN_ID } from './pluginId'
import { runtimeStore } from './runtimeStore'
import type { PluginConfig } from './types'

type TranscriptCaptureRecord = {
    capturedAt: string
    sessionFile: string
    sessionKey?: string
    messageId?: string
    message?: unknown
}

const CAPTURE_DIRECTORY = 'hapi-openclaw'

function resolveCaptureFilePath(ctx: OpenClawPluginServiceContext, config: PluginConfig): string {
    const fileName = config.prototypeCaptureFileName
    return join(ctx.stateDir, CAPTURE_DIRECTORY, fileName)
}

async function writeCaptureRecord(ctx: OpenClawPluginServiceContext, config: PluginConfig, record: TranscriptCaptureRecord): Promise<void> {
    const filePath = resolveCaptureFilePath(ctx, config)
    await mkdir(join(ctx.stateDir, CAPTURE_DIRECTORY), { recursive: true })
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}

function shouldCapture(config: PluginConfig, sessionKey: string | undefined): boolean {
    if (!config.prototypeCaptureSessionKey) {
        return false
    }

    return sessionKey === config.prototypeCaptureSessionKey
}

export function createTranscriptCaptureService(config: PluginConfig): OpenClawPluginService {
    let stopListening: (() => void) | null = null

    return {
        id: `${OPENCLAW_PLUGIN_ID}:transcript-capture`,
        async start(ctx) {
            const runtime = runtimeStore.getRuntime()
            stopListening = runtime.events.onSessionTranscriptUpdate((update: {
                sessionFile: string
                sessionKey?: string
                messageId?: string
                message?: unknown
            }) => {
                if (!shouldCapture(config, update.sessionKey)) {
                    return
                }

                void writeCaptureRecord(ctx, config, {
                    capturedAt: new Date().toISOString(),
                    sessionFile: update.sessionFile,
                    sessionKey: update.sessionKey,
                    messageId: update.messageId,
                    message: update.message
                }).catch((error) => {
                    const message = error instanceof Error ? error.message : String(error)
                    ctx.logger.error(`Failed to write transcript capture: ${message}`)
                })
            })

            ctx.logger.info(`Started ${OPENCLAW_PLUGIN_ID} transcript-capture service`)
        },
        async stop() {
            stopListening?.()
            stopListening = null
        }
    }
}
