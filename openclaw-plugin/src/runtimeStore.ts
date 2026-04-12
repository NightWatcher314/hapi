import { createPluginRuntimeStore, type PluginRuntime } from 'openclaw/plugin-sdk/runtime-store'

export const runtimeStore = createPluginRuntimeStore<PluginRuntime>(
    'OpenClaw plugin runtime is not available outside native plugin registration'
)
