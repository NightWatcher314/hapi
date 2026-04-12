# openclaw-plugin

Mock OpenClaw-side adapter for HAPI integration work.

This package is not a real OpenClaw runtime binding yet. It is a small HTTP service that behaves like the proposed OpenClaw plugin contract from `docs/openclaw-plugin-design.md`.

What it does:

- accepts HAPI outbound commands
- enforces bearer auth
- tracks idempotency keys in memory
- signs callback events back to HAPI
- emits deterministic mock assistant and approval events

Useful env vars:

- `OPENCLAW_PLUGIN_LISTEN_HOST` default `127.0.0.1`
- `OPENCLAW_PLUGIN_LISTEN_PORT` default `3016`
- `OPENCLAW_PLUGIN_SHARED_SECRET` bearer token expected from HAPI
- `HAPI_CALLBACK_BASE_URL` base URL for HAPI hub callbacks
- `HAPI_CALLBACK_SIGNING_SECRET` HMAC secret used for callback signing
- `OPENCLAW_PLUGIN_NAMESPACE` default `default`

Run:

```bash
cd openclaw-plugin
bun run dev
```

Current compatibility note:

- the mock plugin exposes both `/channel/*` and `/hapi/channel/*`
- this is deliberate so it works with the current HAPI `official` client without extra patching
