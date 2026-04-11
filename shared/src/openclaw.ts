import { z } from 'zod'

export const OpenClawConversationStatusSchema = z.enum(['ready', 'waiting', 'error'])
export type OpenClawConversationStatus = z.infer<typeof OpenClawConversationStatusSchema>

export const OpenClawMessageRoleSchema = z.enum(['user', 'assistant', 'system'])
export type OpenClawMessageRole = z.infer<typeof OpenClawMessageRoleSchema>

export const OpenClawMessageStatusSchema = z.enum(['streaming', 'completed', 'failed'])
export type OpenClawMessageStatus = z.infer<typeof OpenClawMessageStatusSchema>

export const OpenClawConversationSummarySchema = z.object({
    id: z.string(),
    title: z.string().nullable(),
    status: OpenClawConversationStatusSchema,
    createdAt: z.number(),
    updatedAt: z.number()
})
export type OpenClawConversationSummary = z.infer<typeof OpenClawConversationSummarySchema>

export const OpenClawMessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    role: OpenClawMessageRoleSchema,
    text: z.string(),
    createdAt: z.number(),
    status: OpenClawMessageStatusSchema.optional()
})
export type OpenClawMessage = z.infer<typeof OpenClawMessageSchema>

export const OpenClawApprovalStatusSchema = z.enum(['pending', 'approved', 'denied'])
export type OpenClawApprovalStatus = z.infer<typeof OpenClawApprovalStatusSchema>

export const OpenClawApprovalRequestSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: OpenClawApprovalStatusSchema,
    createdAt: z.number(),
    resolvedAt: z.number().optional()
})
export type OpenClawApprovalRequest = z.infer<typeof OpenClawApprovalRequestSchema>

export const OpenClawStateSchema = z.object({
    conversationId: z.string(),
    connected: z.boolean(),
    thinking: z.boolean(),
    lastError: z.string().nullable().optional(),
    pendingApprovals: z.array(OpenClawApprovalRequestSchema).optional()
})
export type OpenClawState = z.infer<typeof OpenClawStateSchema>

const OpenClawEventBaseSchema = z.object({
    namespace: z.string().optional(),
    conversationId: z.string()
})

export const OpenClawSyncEventSchema = z.discriminatedUnion('type', [
    OpenClawEventBaseSchema.extend({
        type: z.literal('openclaw-message'),
        message: OpenClawMessageSchema
    }),
    OpenClawEventBaseSchema.extend({
        type: z.literal('openclaw-state'),
        state: OpenClawStateSchema
    }),
    OpenClawEventBaseSchema.extend({
        type: z.literal('openclaw-approval-request'),
        request: OpenClawApprovalRequestSchema
    }),
    OpenClawEventBaseSchema.extend({
        type: z.literal('openclaw-approval-resolved'),
        requestId: z.string(),
        status: z.enum(['approved', 'denied'])
    })
])
export type OpenClawSyncEvent = z.infer<typeof OpenClawSyncEventSchema>
