import { beforeEach, describe, expect, it } from 'bun:test'
import type { PluginRuntime } from 'openclaw/plugin-sdk/runtime-store'
import { adapterState } from './adapterState'
import { HapiCallbackClient } from './hapiClient'
import { RealOpenClawAdapter } from './openclawAdapter'
import { buildHapiSessionKey } from './sessionKeys'

const stubLogger = {
    info() {},
    warn() {},
    error() {}
}

class ThrowingCallbackClient extends HapiCallbackClient {
    attempts = 0

    constructor(private readonly error: Error) {
        super('http://127.0.0.1:3006', 'shared-secret')
    }

    override async postEvent(): Promise<void> {
        this.attempts += 1
        throw this.error
    }
}

describe('RealOpenClawAdapter', () => {
    beforeEach(() => {
        adapterState.resetForTests()
    })

    it('clears the active run when the initial callback fails', async () => {
        const conversationId = buildHapiSessionKey('default', 'debug-user')
        const callbackClient = new ThrowingCallbackClient(new Error('callback unavailable'))
        const runtime = {} as PluginRuntime
        const adapter = new RealOpenClawAdapter('default', runtime, callbackClient, stubLogger)

        await expect(adapter.sendMessage({
            kind: 'send-message',
            conversationId,
            text: 'hello',
            localMessageId: 'msg-1'
        })).rejects.toThrow('callback unavailable')

        expect(callbackClient.attempts).toBe(1)
        expect(adapter.isConversationBusy(conversationId)).toBe(false)
    })
})
