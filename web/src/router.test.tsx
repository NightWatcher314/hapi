import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryHistory } from '@tanstack/react-router'

vi.mock('@/App', () => ({
    App: () => <Outlet />
}))

vi.mock('@/components/OpenClawChat/OpenClawChatPage', () => ({
    OpenClawChatPage: () => <div>openclaw-home</div>
}))

vi.mock('@/components/SessionChat', () => ({
    SessionChat: () => <div>session-chat</div>
}))

vi.mock('@/components/SessionList', () => ({
    SessionList: () => <div>session-list</div>
}))

vi.mock('@/components/NewSession', () => ({
    NewSession: () => <div>new-session</div>
}))

vi.mock('@/components/LoadingState', () => ({
    LoadingState: () => <div>loading</div>
}))

vi.mock('@/routes/sessions/files', () => ({
    default: () => <div>files-page</div>
}))

vi.mock('@/routes/sessions/file', () => ({
    default: () => <div>file-page</div>
}))

vi.mock('@/routes/sessions/terminal', () => ({
    default: () => <div>terminal-page</div>
}))

vi.mock('@/routes/settings', () => ({
    default: () => <div>settings-page</div>
}))

import { createAppRouter } from './router'

describe('router', () => {
    beforeAll(() => {
        window.scrollTo = vi.fn()
    })

    it('renders OpenClaw chat at /', async () => {
        const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))

        render(<RouterProvider router={router} />)

        expect(await screen.findByText('openclaw-home')).toBeInTheDocument()
    })
})
