# OpenClaw Plugin Design for HAPI

## Goal

This document proposes a practical OpenClaw plugin architecture that makes HAPI easier to integrate with a real OpenClaw deployment.

The main idea is:

- HAPI remains the browser-facing product surface.
- A small OpenClaw-side plugin becomes the integration adapter.
- The browser never talks to OpenClaw directly.
- The plugin hides OpenClaw-local runtime details and emits a stable HAPI-facing protocol.

This is the recommended direction because the current HAPI-side OpenClaw work already implements the durable hub model: SQLite-backed conversations, message history, approvals, Server-Sent Events, signed ingress, idempotent command ledgers, and browser UI. What is still unstable is the exact OpenClaw-side runtime and wire contract. A plugin is the cleanest place to absorb that instability.

## Why A Plugin Is Better Than Direct Hub-to-OpenClaw Guesswork

Direct hub integration assumes the HAPI repository can know the final OpenClaw HTTP paths, callback shapes, signature rules, approval lifecycle, and streaming semantics ahead of time. In practice those details usually live closest to the OpenClaw runtime. A plugin reduces that uncertainty.

With a plugin:

- HAPI integrates against one stable adapter protocol that we control.
- OpenClaw-side details stay on the OpenClaw machine.
- Authentication and secrets for OpenClaw stay local to OpenClaw.
- Approval callbacks and streaming events can be translated close to the source.
- Cross-machine deployment becomes easier because the plugin can initiate outbound calls to HAPI even if HAPI cannot directly reach OpenClaw internals.

Without a plugin:

- HAPI must speak directly to OpenClaw internals.
- Every OpenClaw protocol change risks breaking HAPI.
- Live debugging is harder because transport, runtime, and product concerns are mixed.

## Deployment Topology

Recommended topology:

    Browser / Phone
        |
        v
    HAPI Hub
        |
        | stable HAPI <-> plugin protocol
        v
    OpenClaw Plugin
        |
        v
    OpenClaw Runtime

Responsibilities:

- Browser:
  Uses HAPI web UI only.

- HAPI hub:
  Owns auth, conversation persistence, approvals UI, realtime fan-out, and browser-facing API.

- OpenClaw plugin:
  Owns OpenClaw-local runtime integration, runtime auth, message execution, approval hooks, and event translation.

- OpenClaw runtime:
  Remains the source of actual assistant execution.

## Design Principles

The plugin should be thin. It should not become a second hub.

Keep these responsibilities in HAPI:

- web UI
- login and user identity
- SQLite persistence
- conversation history shown to the user
- approval list and approval UI
- SSE broadcasting to browser clients
- retry-safe deduplication and product-level audit trail

Keep these responsibilities in the plugin:

- OpenClaw runtime auth
- mapping HAPI commands into OpenClaw actions
- mapping OpenClaw runtime events into HAPI callback events
- local approval interception
- local streaming interception
- plugin-to-hub request signing

Do not put these in the plugin:

- browser UI
- long-term source-of-truth chat storage
- direct browser auth
- product navigation

## Proposed Plugin Contract

The plugin should expose a stable adapter contract to HAPI. The current HAPI hub implementation already expects two directions:

1. outbound commands from HAPI to OpenClaw
2. inbound events from OpenClaw back to HAPI

The plugin should preserve that model.

### Outbound Commands From HAPI To Plugin

These commands should be sent from HAPI to the plugin:

- `ensure-default-conversation`
- `send-message`
- `approve`
- `deny`

The plugin should return only command acknowledgement, not final assistant output.

Example acknowledgement:

    {
      "accepted": true,
      "upstreamRequestId": "req_123",
      "upstreamConversationId": "thread_abc",
      "retryAfterMs": null
    }

This keeps HAPI aligned with its current async transport design. HAPI already stores outbound command rows and waits for later inbound events to update the visible conversation.

### Inbound Events From Plugin To HAPI

The plugin should call HAPI:

    POST /api/openclaw/channel/events

and send only normalized events:

- `message`
- `approval-request`
- `approval-resolved`
- `state`

These events match the current hub-side OpenClaw service design. The plugin should translate any OpenClaw-native payloads into these normalized shapes before sending them to HAPI.

Example message event:

    {
      "type": "message",
      "eventId": "evt_123",
      "occurredAt": 1712840000000,
      "namespace": "default",
      "conversationId": "thread_abc",
      "externalMessageId": "msg_456",
      "role": "assistant",
      "content": {
        "mode": "append",
        "delta": "hello"
      },
      "status": "streaming"
    }

Example approval request event:

    {
      "type": "approval-request",
      "eventId": "evt_124",
      "occurredAt": 1712840001000,
      "namespace": "default",
      "conversationId": "thread_abc",
      "requestId": "approval_1",
      "title": "Allow command execution",
      "description": "OpenClaw wants to run npm install"
    }

Example approval resolution event:

    {
      "type": "approval-resolved",
      "eventId": "evt_125",
      "occurredAt": 1712840005000,
      "namespace": "default",
      "conversationId": "thread_abc",
      "requestId": "approval_1",
      "status": "approved"
    }

Example state event:

    {
      "type": "state",
      "eventId": "evt_126",
      "occurredAt": 1712840006000,
      "namespace": "default",
      "conversationId": "thread_abc",
      "connected": true,
      "thinking": false,
      "lastError": null
    }

## Authentication And Signing

The plugin should authenticate in both directions.

### HAPI To Plugin

Recommended:

- `Authorization: Bearer <plugin-shared-secret-or-jwt>`
- `Idempotency-Key: <uuid>`

The plugin should reject unauthenticated requests and should treat repeated `Idempotency-Key` values as retry-safe duplicates.

### Plugin To HAPI

Recommended:

- `x-openclaw-timestamp`
- `x-openclaw-signature`

Signing algorithm:

- payload string: `<timestamp>.<rawBody>`
- digest: `HMAC-SHA256(sharedSecret, payloadString)`

This already matches the current HAPI ingress verifier in `hub/src/openclaw/protocol.ts` and `hub/src/web/routes/openclawIngress.ts`.

## Conversation Identity

The plugin should own the OpenClaw-native thread or conversation identifier, but HAPI should remain the owner of user-visible local conversation records.

Recommended rule:

- HAPI stores one local conversation row per authenticated HAPI user.
- That row stores an `external_id`.
- `external_id` is the OpenClaw-native thread ID returned by the plugin.

The plugin should never invent its own separate user identity model for the browser. It should accept HAPI’s external user key when ensuring a default conversation and map that to OpenClaw-local thread creation or lookup.

## Approval Model

The plugin should intercept approvals close to the OpenClaw runtime.

Recommended lifecycle:

1. HAPI sends `approve` or `deny` command to plugin.
2. Plugin acknowledges only that it accepted the command.
3. Plugin performs the OpenClaw-side approval action.
4. Plugin emits authoritative `approval-resolved` event back to HAPI.
5. HAPI marks the approval row resolved only after that event arrives.

This is important because the HAPI UI should not lie about approval success if the OpenClaw-side action actually failed.

## Streaming Model

The plugin should normalize streaming into one of two update modes:

- `replace`
- `append`

If the OpenClaw runtime exposes full message snapshots, the plugin should emit:

    { "mode": "replace", "text": "full current text" }

If the OpenClaw runtime exposes token deltas or chunk deltas, the plugin should emit:

    { "mode": "append", "delta": "new chunk" }

The current HAPI hub already supports both modes and keeps one logical assistant message row per `externalMessageId`.

## Error Handling

The plugin should translate OpenClaw-local failures into one of two outcomes:

1. command rejection before execution
2. later state event with `lastError`

Recommended rules:

- If the plugin cannot accept the command at all, return a non-2xx response to HAPI.
- If the plugin accepts the command but later fails during execution, send a `state` event with `lastError`.
- Do not emit fake assistant fallback text to describe errors unless OpenClaw itself emitted that text.

## Retry And Idempotency

The plugin must be retry-safe because HAPI already stores command and receipt ledgers.

Plugin requirements:

- Every inbound command from HAPI must support idempotency by key.
- Every outbound event to HAPI must carry a unique `eventId`.
- Re-sending the same event must not change final HAPI state more than once.

HAPI-side support already exists:

- outbound command ledger in `hub/src/store/openclawCommands.ts`
- inbound receipt ledger in `hub/src/store/openclawReceipts.ts`

The plugin should mirror that discipline locally so both sides can recover from network retries and process restarts.

## Suggested Plugin API

This is the recommended first version.

### Plugin HTTP Endpoints

These endpoints live on the OpenClaw machine:

    POST /hapi/channel/conversations/default
    POST /hapi/channel/messages
    POST /hapi/channel/approvals/:requestId/approve
    POST /hapi/channel/approvals/:requestId/deny
    GET  /hapi/health

`GET /hapi/health` should return a simple connectivity summary:

    {
      "ok": true,
      "pluginVersion": "0.1.0",
      "openclawConnected": true
    }

### HAPI Outbound Payloads

Ensure default conversation:

    {
      "externalUserKey": "default:123"
    }

Send message:

    {
      "conversationId": "thread_abc",
      "text": "hello",
      "localMessageId": "local_msg_1"
    }

Approve:

    {
      "conversationId": "thread_abc"
    }

Deny:

    {
      "conversationId": "thread_abc"
    }

### Plugin Callback Target

Configured on the plugin side:

    HAPI_CALLBACK_BASE_URL=https://hapi.example.com
    HAPI_CALLBACK_SIGNING_SECRET=...
    HAPI_PLUGIN_SHARED_SECRET=...

The plugin posts callbacks to:

    ${HAPI_CALLBACK_BASE_URL}/api/openclaw/channel/events

## State Synchronization

The plugin should emit state changes proactively.

Useful moments:

- plugin startup
- plugin reconnect to OpenClaw runtime
- plugin loses connection to OpenClaw runtime
- assistant starts thinking
- assistant stops thinking
- command fails after acknowledgement

The purpose is to keep the HAPI homepage honest even when no visible assistant message is arriving.

## Minimal Viable Plugin

MVP scope should be intentionally narrow.

Phase 1:

- health endpoint
- ensure default conversation
- send message acknowledgement
- callback for assistant message events
- callback signing

Phase 2:

- approval request callbacks
- approve and deny commands
- approval resolved callbacks

Phase 3:

- full streaming semantics
- reconnect events
- richer error reporting
- metrics and diagnostics

## Recommended Implementation Plan

Implement in this order:

1. Define the stable HAPI <-> plugin contract in one document and one test fixture set.
2. Build a tiny mock plugin server first to validate HAPI against the plugin protocol, without real OpenClaw runtime wiring.
3. Once HAPI and mock plugin interoperate, replace mock internals with real OpenClaw runtime calls.
4. Only after that, add production auth, retries, and deployment packaging.

This order matters because it separates protocol correctness from runtime integration correctness.

## Validation Strategy

A complete validation run should prove these scenarios:

1. Browser sends a message through HAPI.
2. HAPI sends `send-message` to plugin.
3. Plugin acknowledges immediately.
4. Plugin later emits assistant `message` events.
5. HAPI updates one logical assistant row in the UI.
6. Plugin emits `approval-request`.
7. User presses approve in HAPI.
8. HAPI sends `approve` to plugin.
9. Plugin resolves the runtime approval.
10. Plugin emits `approval-resolved`.
11. HAPI updates UI only after that event arrives.

Negative-path validation:

1. duplicate callback event
2. invalid callback signature
3. lost plugin-to-hub network, then retry
4. plugin accepts command, runtime later fails
5. HAPI retries a command with same idempotency key

## Proposed Next Repo Changes

The next implementation step should be a separate plugin-focused ExecPlan plus either:

- a mock plugin service under a new workspace package, or
- a standalone reference plugin repo if OpenClaw has its own plugin packaging conventions

If implemented in this repo first, a reasonable starting location would be:

    openclaw-plugin/

with:

    openclaw-plugin/src/index.ts
    openclaw-plugin/src/config.ts
    openclaw-plugin/src/openclawRuntime.ts
    openclaw-plugin/src/hapiClient.ts
    openclaw-plugin/src/signing.ts
    openclaw-plugin/src/routes.ts

That package should start as a mock adapter and only later gain real OpenClaw runtime bindings.

## Bottom Line

The recommended product architecture is:

- HAPI hub stays the product and browser boundary.
- An OpenClaw plugin becomes the runtime adapter.
- The plugin speaks a narrow, stable protocol to HAPI.
- OpenClaw-local complexity stays on the OpenClaw machine.

This gives the cleanest operator experience and the lowest long-term maintenance cost.
