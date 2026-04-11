import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { OpenClawState } from '@hapi/protocol/types'
import { queryKeys } from '@/lib/query-keys'

export function useOpenClawState(
    api: ApiClient | null,
    conversationId: string | null
): {
    state: OpenClawState | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.openclawState(conversationId ?? 'none'),
        queryFn: async () => {
            if (!api || !conversationId) {
                throw new Error('Conversation unavailable')
            }
            return await api.getOpenClawState(conversationId)
        },
        enabled: Boolean(api && conversationId)
    })

    return {
        state: query.data?.state ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load OpenClaw state' : null,
        refetch: query.refetch
    }
}
