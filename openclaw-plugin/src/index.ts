import { definePluginEntry, type OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import { PLUGIN_CONFIG_JSON_SCHEMA, resolvePluginConfig, resolvePluginConfigFromOpenClawConfig } from './config'
import { forwardNodeRequestToHono } from './nativeRoute'
import { RealOpenClawAdapter } from './openclawAdapter'
import { OPENCLAW_PLUGIN_DESCRIPTION, OPENCLAW_PLUGIN_ID, OPENCLAW_PLUGIN_NAME } from './pluginId'
import { runtimeStore } from './runtimeStore'
import { createTranscriptBridgeService } from './transcriptBridge'
import { createTranscriptCaptureService } from './transcriptCapture'
import { HapiCallbackClient } from './hapiClient'
import { createPluginApp } from './routes'

function resolveRegisteredPluginConfig(api: OpenClawPluginApi) {
    const runtimeConfigured = resolvePluginConfigFromOpenClawConfig(api.runtime?.config?.loadConfig?.())
    if (runtimeConfigured) {
        return runtimeConfigured
    }

    const configured = resolvePluginConfigFromOpenClawConfig(api.config)
    if (configured) {
        return configured
    }

    return resolvePluginConfig(api.pluginConfig ?? {})
}

function registerPluginRoutes(api: OpenClawPluginApi): void {
    const config = resolveRegisteredPluginConfig(api)
    const callbackClient = new HapiCallbackClient(config.hapiBaseUrl, config.sharedSecret)
    const runtime = new RealOpenClawAdapter(config.namespace, api.runtime, callbackClient, api.logger)
    const app = createPluginApp({
        sharedSecret: config.sharedSecret,
        namespace: config.namespace,
        callbackClient,
        runtime,
        idempotencyCache: new Map(),
        prototypeCaptureSessionKey: config.prototypeCaptureSessionKey,
        prototypeCaptureFileName: config.prototypeCaptureFileName,
        logger: api.logger
    })

    api.registerHttpRoute({
        path: '/hapi',
        auth: 'plugin',
        match: 'prefix',
        handler: async (req, res) => await forwardNodeRequestToHono(app, req, res)
    })
}

export default definePluginEntry({
    id: OPENCLAW_PLUGIN_ID,
    name: OPENCLAW_PLUGIN_NAME,
    description: OPENCLAW_PLUGIN_DESCRIPTION,
    configSchema: {
        jsonSchema: PLUGIN_CONFIG_JSON_SCHEMA,
        validate(value) {
            try {
                resolvePluginConfig(value)
                return { ok: true, value }
            } catch (error) {
                return {
                    ok: false,
                    errors: [error instanceof Error ? error.message : 'Invalid plugin config']
                }
            }
        }
    },
    register(api) {
        if (api.registrationMode !== 'full') {
            return
        }

        runtimeStore.setRuntime(api.runtime)
        registerPluginRoutes(api)
        const config = resolveRegisteredPluginConfig(api)
        api.registerService(createTranscriptBridgeService(config))
        api.registerService(createTranscriptCaptureService(config))
    }
})
