export type StoredSession = {
    id: string
    tag: string | null
    namespace: string
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    model: string | null
    modelReasoningEffort: string | null
    effort: string | null
    todos: unknown | null
    todosUpdatedAt: number | null
    teamState: unknown | null
    teamStateUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMachine = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type StoredUser = {
    id: number
    platform: string
    platformUserId: string
    namespace: string
    createdAt: number
}

export type StoredPushSubscription = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

export type StoredOpenClawConversation = {
    id: string
    namespace: string
    userKey: string
    externalId: string
    title: string | null
    status: string
    connected: boolean
    thinking: boolean
    lastError: string | null
    createdAt: number
    updatedAt: number
}

export type StoredOpenClawMessage = {
    id: string
    conversationId: string
    namespace: string
    externalId: string | null
    role: string
    text: string
    createdAt: number
    seq: number
    status: string | null
}

export type StoredOpenClawApproval = {
    id: string
    conversationId: string
    namespace: string
    title: string
    description: string | null
    status: string
    createdAt: number
    resolvedAt: number | null
}

export type StoredOpenClawCommand = {
    id: string
    namespace: string
    conversationId: string
    type: string
    localMessageId: string | null
    approvalRequestId: string | null
    idempotencyKey: string
    upstreamConversationId: string | null
    upstreamRequestId: string | null
    status: string
    lastError: string | null
    createdAt: number
    updatedAt: number
}

export type StoredOpenClawReceipt = {
    id: number
    namespace: string
    eventId: string
    upstreamConversationId: string | null
    eventType: string
    firstSeenAt: number
    processedAt: number | null
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
