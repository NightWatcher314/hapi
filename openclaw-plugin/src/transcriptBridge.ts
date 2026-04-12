import type { OpenClawPluginService, OpenClawPluginServiceContext } from 'openclaw/plugin-sdk/plugin-entry'
import { HapiCallbackClient } from './hapiClient'
import { adapterState } from './adapterState'
import { normalizeAssistantTranscriptEvent } from './transcriptEvents'
import { runtimeStore } from './runtimeStore'
import { OPENCLAW_PLUGIN_ID } from './pluginId'
import type { PluginConfig } from './types'

async function handleTranscriptUpdate(
    ctx: OpenClawPluginServiceContext,
    callbackClient: HapiCallbackClient,
    update: {
        sessionKey?: string
        messageId?: string
        message?: unknown
    }
): Promise<void> {
    const event = normalizeAssistantTranscriptEvent(update)
    if (!event) {
        return
    }

    if (!adapterState.rememberTranscriptMessage(event.externalMessageId)) {
        return
    }

    await callbackClient.postEvent(event)

    if (adapterState.finishRun(event.conversationId)) {
        await callbackClient.postEvent({
            type: 'state',
            eventId: `${event.eventId}:state`,
            occurredAt: Date.now(),
            namespace: event.namespace,
            conversationId: event.conversationId,
            connected: true,
            thinking: false,
            lastError: null
        })
    }
}

export function createTranscriptBridgeService(config: PluginConfig): OpenClawPluginService {
    let stopListening: (() => void) | null = null

    return {
        id: `${OPENCLAW_PLUGIN_ID}:transcript-bridge`,
        async start(ctx) {
            const callbackClient = new HapiCallbackClient(config.hapiBaseUrl, config.sharedSecret)
            const runtime = runtimeStore.getRuntime()

            stopListening = runtime.events.onSessionTranscriptUpdate((update) => {
                void handleTranscriptUpdate(ctx, callbackClient, update).catch((error) => {
                    const message = error instanceof Error ? error.message : String(error)
                    ctx.logger.error(`Failed to bridge transcript update: ${message}`)
                })
            })

            ctx.logger.info(`Started ${OPENCLAW_PLUGIN_ID} transcript-bridge service`)
        },
        async stop() {
            stopListening?.()
            stopListening = null
        }
    }
}
