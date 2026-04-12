import { describe, expect, it } from 'bun:test'
import { signCallbackBody } from './signing'

describe('plugin signing', () => {
    it('produces deterministic signatures', () => {
        const first = signCallbackBody(123, '{"ok":true}', 'secret')
        const second = signCallbackBody(123, '{"ok":true}', 'secret')
        expect(first).toBe(second)
    })
})
