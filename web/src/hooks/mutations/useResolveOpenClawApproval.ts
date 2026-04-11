import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useResolveOpenClawApproval(api: ApiClient | null): {
    approve: (conversationId: string, requestId: string) => Promise<void>
    deny: (conversationId: string, requestId: string) => Promise<void>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()
    const mutation = useMutation({
        mutationFn: async (input: {
            action: 'approve' | 'deny'
            conversationId: string
            requestId: string
        }) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            if (input.action === 'approve') {
                return await api.approveOpenClawRequest(input.conversationId, input.requestId)
            }
            return await api.denyOpenClawRequest(input.conversationId, input.requestId)
        },
        onSuccess: async (_result, input) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.openclawMessages(input.conversationId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.openclawState(input.conversationId) })
            ])
        }
    })

    return {
        approve: async (conversationId: string, requestId: string) => {
            await mutation.mutateAsync({ action: 'approve', conversationId, requestId })
        },
        deny: async (conversationId: string, requestId: string) => {
            await mutation.mutateAsync({ action: 'deny', conversationId, requestId })
        },
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? 'Failed to resolve OpenClaw approval' : null
    }
}
