import type { OpenClawApprovalRequest } from '@hapi/protocol/types'
import { useTranslation } from '@/lib/use-translation'

export function OpenClawApprovalCard(props: {
    approval: OpenClawApprovalRequest
    disabled?: boolean
    onApprove: () => void
    onDeny: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
            <div className="text-xs uppercase tracking-[0.12em] text-[var(--app-hint)]">OpenClaw approval</div>
            <div className="mt-1 text-sm font-semibold text-[var(--app-fg)]">{props.approval.title}</div>
            {props.approval.description ? (
                <div className="mt-1 text-sm text-[var(--app-hint)] whitespace-pre-wrap break-words">
                    {props.approval.description}
                </div>
            ) : null}
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={props.disabled}
                    onClick={props.onApprove}
                >
                    {t('tool.allow')}
                </button>
                <button
                    type="button"
                    className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] disabled:opacity-50"
                    disabled={props.disabled}
                    onClick={props.onDeny}
                >
                    {t('tool.deny')}
                </button>
            </div>
        </div>
    )
}
