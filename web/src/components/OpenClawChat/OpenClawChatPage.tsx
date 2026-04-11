import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useOpenClawConversation } from '@/hooks/queries/useOpenClawConversation'
import { useOpenClawMessages } from '@/hooks/queries/useOpenClawMessages'
import { useOpenClawState } from '@/hooks/queries/useOpenClawState'
import { useSendOpenClawMessage } from '@/hooks/mutations/useSendOpenClawMessage'
import { useResolveOpenClawApproval } from '@/hooks/mutations/useResolveOpenClawApproval'
import { LoadingState } from '@/components/LoadingState'
import { useTranslation } from '@/lib/use-translation'
import { OpenClawComposer } from './OpenClawComposer'
import { OpenClawThread } from './OpenClawThread'

export function OpenClawChatPage() {
    const navigate = useNavigate()
    const { api } = useAppContext()
    const { t } = useTranslation()
    const { conversation, isLoading: conversationLoading, error: conversationError } = useOpenClawConversation(api)
    const conversationId = conversation?.id ?? null
    const { messages, isLoading: messagesLoading, error: messagesError } = useOpenClawMessages(api, conversationId)
    const { state, isLoading: stateLoading, error: stateError } = useOpenClawState(api, conversationId)
    const { sendMessage, isPending: isSending, error: sendError } = useSendOpenClawMessage(api)
    const {
        approve,
        deny,
        isPending: isResolvingApproval,
        error: approvalError
    } = useResolveOpenClawApproval(api)

    const handleSend = useCallback(async (text: string) => {
        if (!conversationId) return
        await sendMessage(conversationId, text)
    }, [conversationId, sendMessage])

    const handleApprove = useCallback((requestId: string) => {
        if (!conversationId) return
        void approve(conversationId, requestId)
    }, [approve, conversationId])

    const handleDeny = useCallback((requestId: string) => {
        if (!conversationId) return
        void deny(conversationId, requestId)
    }, [conversationId, deny])

    const loading = conversationLoading || messagesLoading || stateLoading
    const error = conversationError ?? messagesError ?? stateError ?? sendError ?? approvalError

    if (loading && !conversationId) {
        return (
            <div className="flex h-full items-center justify-center p-4">
                <LoadingState label="Loading OpenClaw…" className="text-sm" />
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className="mx-auto flex w-full max-w-content items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.16em] text-[var(--app-hint)]">OpenClaw Channel</div>
                        <div className="truncate text-base font-semibold text-[var(--app-fg)]">
                            {conversation?.title ?? 'OpenClaw'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/sessions' })}
                            className="rounded-full border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-fg)]"
                        >
                            Sessions
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/settings' })}
                            className="rounded-full border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-fg)]"
                        >
                            {t('chat.settings')}
                        </button>
                    </div>
                </div>
                {error ? (
                    <div className="mx-auto mt-2 w-full max-w-content text-sm text-red-600">
                        {error}
                    </div>
                ) : null}
            </div>

            <OpenClawThread
                messages={messages}
                approvals={state?.pendingApprovals ?? []}
                approvalsDisabled={isResolvingApproval}
                onApprove={handleApprove}
                onDeny={handleDeny}
            />

            <OpenClawComposer
                disabled={!conversationId || isSending}
                onSend={handleSend}
            />
        </div>
    )
}
