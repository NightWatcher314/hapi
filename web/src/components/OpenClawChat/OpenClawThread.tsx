import type { OpenClawApprovalRequest, OpenClawMessage } from '@hapi/protocol/types'
import { OpenClawApprovalCard } from './OpenClawApprovalCard'

function roleLabel(role: OpenClawMessage['role']): string {
    if (role === 'assistant') return 'OpenClaw'
    if (role === 'system') return 'System'
    return 'You'
}

export function OpenClawThread(props: {
    messages: OpenClawMessage[]
    approvals: OpenClawApprovalRequest[]
    approvalsDisabled?: boolean
    onApprove: (requestId: string) => void
    onDeny: (requestId: string) => void
}) {
    return (
        <div className="app-scroll-y flex-1 min-h-0 px-3 py-3">
            <div className="mx-auto flex w-full max-w-content flex-col gap-3">
                {props.messages.map((message) => (
                    <div
                        key={message.id}
                        className={`rounded-2xl px-4 py-3 ${
                            message.role === 'user'
                                ? 'ml-auto max-w-[85%] bg-[var(--app-link)] text-white'
                                : 'mr-auto max-w-[90%] border border-[var(--app-border)] bg-[var(--app-secondary-bg)] text-[var(--app-fg)]'
                        }`}
                    >
                        <div className={`text-[11px] uppercase tracking-[0.12em] ${message.role === 'user' ? 'text-white/70' : 'text-[var(--app-hint)]'}`}>
                            {roleLabel(message.role)}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words text-sm">
                            {message.text}
                        </div>
                    </div>
                ))}

                {props.approvals.map((approval) => (
                    <OpenClawApprovalCard
                        key={approval.id}
                        approval={approval}
                        disabled={props.approvalsDisabled}
                        onApprove={() => props.onApprove(approval.id)}
                        onDeny={() => props.onDeny(approval.id)}
                    />
                ))}
            </div>
        </div>
    )
}
