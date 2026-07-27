import { describe, expect, it } from 'vitest'
import { formatInlineMediaCommand, inlineMediaHelperScriptPath } from './doctorInlineMedia'

describe('doctorInlineMedia', () => {
    it('formatInlineMediaCommand uses repo scripts path', () => {
        const script = inlineMediaHelperScriptPath()
        expect(formatInlineMediaCommand(script, '341fe421')).toContain(
            'bun scripts/tooling/hapi-display-image.mjs "341fe421"'
        )
    })

    it('formatInlineMediaCommand shell-quotes paths with spaces', () => {
        const cmd = formatInlineMediaCommand(
            '/tmp/my repo/cli/src/ui/doctorInlineMedia.ts',
            'abc12345',
            '/tmp/my pics/shot.png',
        )
        expect(cmd).toContain('cd "/tmp/my repo"')
        expect(cmd).toContain('"abc12345"')
        expect(cmd).toContain('"/tmp/my pics/shot.png"')
    })
})
