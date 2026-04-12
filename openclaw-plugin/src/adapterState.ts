const activeRuns = new Set<string>()
const seenTranscriptMessageIds = new Set<string>()

export const adapterState = {
    startRun(sessionKey: string): boolean {
        if (activeRuns.has(sessionKey)) {
            return false
        }

        activeRuns.add(sessionKey)
        return true
    },

    isRunActive(sessionKey: string): boolean {
        return activeRuns.has(sessionKey)
    },

    finishRun(sessionKey: string): boolean {
        return activeRuns.delete(sessionKey)
    },

    rememberTranscriptMessage(messageId: string): boolean {
        if (seenTranscriptMessageIds.has(messageId)) {
            return false
        }

        seenTranscriptMessageIds.add(messageId)
        return true
    },

    resetForTests(): void {
        activeRuns.clear()
        seenTranscriptMessageIds.clear()
    }
}
