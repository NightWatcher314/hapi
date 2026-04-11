import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OpenClawChatPage } from './OpenClawChatPage'
import { useNavigate } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useOpenClawConversation } from '@/hooks/queries/useOpenClawConversation'
import { useOpenClawMessages } from '@/hooks/queries/useOpenClawMessages'
import { useOpenClawState } from '@/hooks/queries/useOpenClawState'
import { useSendOpenClawMessage } from '@/hooks/mutations/useSendOpenClawMessage'
import { useResolveOpenClawApproval } from '@/hooks/mutations/useResolveOpenClawApproval'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: vi.fn(),
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: vi.fn(),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'chat.placeholder': 'Message OpenClaw',
            'chat.send': 'Send',
            'chat.settings': 'Settings',
            'tool.allow': 'Allow',
            'tool.deny': 'Deny',
        }[key] ?? key)
    }),
}))

vi.mock('@/hooks/queries/useOpenClawConversation', () => ({
    useOpenClawConversation: vi.fn(),
}))

vi.mock('@/hooks/queries/useOpenClawMessages', () => ({
    useOpenClawMessages: vi.fn(),
}))

vi.mock('@/hooks/queries/useOpenClawState', () => ({
    useOpenClawState: vi.fn(),
}))

vi.mock('@/hooks/mutations/useSendOpenClawMessage', () => ({
    useSendOpenClawMessage: vi.fn(),
}))

vi.mock('@/hooks/mutations/useResolveOpenClawApproval', () => ({
    useResolveOpenClawApproval: vi.fn(),
}))

const navigateMock = vi.fn()
const sendMessageMock = vi.fn()
const approveMock = vi.fn()
const denyMock = vi.fn()

describe('OpenClawChatPage', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        vi.clearAllMocks()

        vi.mocked(useNavigate).mockReturnValue(navigateMock)
        vi.mocked(useAppContext).mockReturnValue({
            api: {} as never,
            token: 'token',
            baseUrl: 'http://localhost:3006'
        })
        vi.mocked(useOpenClawConversation).mockReturnValue({
            conversation: {
                id: 'conv-1',
                title: 'OpenClaw',
                status: 'ready',
                createdAt: 1,
                updatedAt: 1
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        vi.mocked(useOpenClawMessages).mockReturnValue({
            messages: [{
                id: 'msg-1',
                conversationId: 'conv-1',
                role: 'assistant',
                text: 'hello from openclaw',
                createdAt: 1,
                status: 'completed'
            }],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        vi.mocked(useOpenClawState).mockReturnValue({
            state: {
                conversationId: 'conv-1',
                connected: true,
                thinking: false,
                lastError: null,
                pendingApprovals: [{
                    id: 'req-1',
                    conversationId: 'conv-1',
                    title: 'Approve action',
                    description: 'Need approval',
                    status: 'pending',
                    createdAt: 2
                }]
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        vi.mocked(useSendOpenClawMessage).mockReturnValue({
            sendMessage: sendMessageMock.mockResolvedValue(undefined),
            isPending: false,
            error: null
        })
        vi.mocked(useResolveOpenClawApproval).mockReturnValue({
            approve: approveMock.mockResolvedValue(undefined),
            deny: denyMock.mockResolvedValue(undefined),
            isPending: false,
            error: null
        })
    })

    it('renders the OpenClaw thread on the homepage', () => {
        render(<OpenClawChatPage />)

        expect(screen.getByText('OpenClaw Channel')).toBeInTheDocument()
        expect(screen.getByText('hello from openclaw')).toBeInTheDocument()
        expect(screen.getByText('Approve action')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sessions' })).toBeInTheDocument()
    })

    it('wires composer and approval actions to the OpenClaw hooks', async () => {
        render(<OpenClawChatPage />)

        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: '  hello from web  ' }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith('conv-1', 'hello from web')
        })

        fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
        fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
        fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))

        expect(approveMock).toHaveBeenCalledWith('conv-1', 'req-1')
        expect(denyMock).toHaveBeenCalledWith('conv-1', 'req-1')
        expect(navigateMock).toHaveBeenCalledWith({ to: '/sessions' })
    })
})
