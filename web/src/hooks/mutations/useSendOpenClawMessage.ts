import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useSendOpenClawMessage(api: ApiClient | null): {
    sendMessage: (conversationId: string, text: string) => Promise<void>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()
    const mutation = useMutation({
        mutationFn: async (input: { conversationId: string; text: string }) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.sendOpenClawMessage(input.conversationId, input.text)
        },
        onSettled: async (_result, _error, input) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.openclawMessages(input.conversationId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.openclawState(input.conversationId) })
            ])
        }
    })

    return {
        sendMessage: async (conversationId: string, text: string) => {
            await mutation.mutateAsync({ conversationId, text })
        },
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? 'Failed to send OpenClaw message' : null
    }
}
