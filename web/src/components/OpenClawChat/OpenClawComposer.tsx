import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

export function OpenClawComposer(props: {
    disabled?: boolean
    onSend: (text: string) => Promise<void>
}) {
    const { t } = useTranslation()
    const [text, setText] = useState('')

    const handleSend = async () => {
        const trimmed = text.trim()
        if (!trimmed || props.disabled) {
            return
        }
        await props.onSend(trimmed)
        setText('')
    }

    return (
        <div className="border-t border-[var(--app-border)] bg-[var(--app-bg)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2">
                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t('chat.placeholder')}
                    rows={3}
                    disabled={props.disabled}
                    className="min-h-[88px] flex-1 resize-none rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none"
                />
                <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={props.disabled || text.trim().length === 0}
                    className="rounded-xl bg-[var(--app-link)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                    {t('chat.send')}
                </button>
            </div>
        </div>
    )
}
