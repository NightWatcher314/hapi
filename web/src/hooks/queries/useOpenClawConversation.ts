import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { OpenClawConversationSummary } from '@hapi/protocol/types'
import { queryKeys } from '@/lib/query-keys'

export function useOpenClawConversation(
    api: ApiClient | null,
    enabled = true
): {
    conversation: OpenClawConversationSummary | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.openclawConversation,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getOpenClawConversation()
        },
        enabled: Boolean(api) && enabled
    })

    return {
        conversation: query.data?.conversation ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load OpenClaw conversation' : null,
        refetch: query.refetch
    }
}
