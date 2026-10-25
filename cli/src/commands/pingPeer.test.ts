import { describe, expect, it } from 'vitest'
import { PingPeerError } from '@/modules/pingPeer/pingPeer'
import { parsePingPeerArgs } from './pingPeer'

describe('parsePingPeerArgs', () => {
    it('parses positional prefix + message', () => {
        expect(parsePingPeerArgs(['05d9f0f2', 'hello'])).toEqual({
            help: false,
            list: false,
            sessionIdPrefix: '05d9f0f2',
            message: 'hello'
        })
    })

    it('parses --message-file and --wait', () => {
        expect(parsePingPeerArgs(['abc', '--message-file', 'brief.md', '--wait', '30'])).toEqual({
            help: false,
            list: false,
            sessionIdPrefix: 'abc',
            messageFile: 'brief.md',
            waitActiveSecs: 30
        })
    })

    it('parses --list and --help', () => {
        expect(parsePingPeerArgs(['--list'])).toEqual({ help: false, list: true })
        expect(parsePingPeerArgs(['--help']).help).toBe(true)
    })

    it('rejects unknown flags', () => {
        expect(() => parsePingPeerArgs(['--host', 'evil'])).toThrow(PingPeerError)
    })

    it.each(['queue', 'steer'] as const)('parses delivery mode %s in both flag forms', (mode) => {
        for (const flags of [['--delivery-mode', mode], [`--delivery-mode=${mode}`]]) {
            expect(parsePingPeerArgs(['abc', 'hello', ...flags]).deliveryMode).toBe(mode)
        }
    })

    it.each([
        ['--delivery-mode'],
        ['--delivery-mode='],
        ['--delivery-mode', 'interrupt'],
        ['--delivery-mode', '--list'],
        ['--delivery-mode', 'queue', '--delivery-mode=steer']
    ])('rejects invalid or repeated delivery flags: %j', (...flags) => {
        expect(() => parsePingPeerArgs(['abc', 'hello', ...flags])).toThrow(PingPeerError)
    })
})
