import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { OpenClawMessage } from '@hapi/protocol/types'
import { queryKeys } from '@/lib/query-keys'

export function useOpenClawMessages(
    api: ApiClient | null,
    conversationId: string | null
): {
    messages: OpenClawMessage[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.openclawMessages(conversationId ?? 'none'),
        queryFn: async () => {
            if (!api || !conversationId) {
                throw new Error('Conversation unavailable')
            }
            return await api.getOpenClawMessages(conversationId)
        },
        enabled: Boolean(api && conversationId)
    })

    return {
        messages: query.data?.messages ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load OpenClaw messages' : null,
        refetch: query.refetch
    }
}
