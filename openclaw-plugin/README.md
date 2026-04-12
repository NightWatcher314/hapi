# @twsxtd/hapi-openclaw

Native OpenClaw plugin adapter for HAPI integration work.

This package installs as an OpenClaw native plugin and exposes the HAPI-facing `/hapi/*` route surface from inside the OpenClaw Gateway. V1 now creates or resumes real OpenClaw sessions, starts real embedded-agent runs, and forwards real assistant transcript messages back into HAPI. Approval bridging is still deferred.

What it does:

- exposes `/hapi/health` and `/hapi/channel/*` through `api.registerHttpRoute(...)`
- enforces plugin-managed bearer auth
- signs callback events back to HAPI
- derives deterministic OpenClaw session keys from HAPI namespace + user key
- starts real OpenClaw embedded-agent runs for `send-message`
- bridges assistant transcript text updates into HAPI `message` / `state` callbacks
- returns `501` for approval endpoints until the real approval bridge lands
- records real transcript-update payloads to plugin state when `prototypeCaptureSessionKey` is configured

Plugin config lives under `plugins.entries.hapi-openclaw.config` in OpenClaw config:

- `hapiBaseUrl` base URL for HAPI hub callbacks
- `sharedSecret` shared secret used for HAPI bearer auth and callback signing
- `namespace` optional callback namespace override, default `default`
- `prototypeCaptureSessionKey` optional session key whose transcript updates should be captured for real-runtime inspection
- `prototypeCaptureFileName` optional JSONL file name under plugin state, default `transcript-capture.jsonl`

Install from npm:

```bash
openclaw plugins install @twsxtd/hapi-openclaw
openclaw gateway restart
```

Publish from this repo:

```bash
cd openclaw-plugin
npm publish --access public
```

Local packaging smoke test:

```bash
cd openclaw-plugin
npm pack --dry-run
```

Example OpenClaw config:

```json
{
    "plugins": {
        "entries": {
            "hapi-openclaw": {
                "enabled": true,
                "config": {
                    "hapiBaseUrl": "http://127.0.0.1:3006",
                    "sharedSecret": "test-secret",
                    "namespace": "default",
                    "prototypeCaptureSessionKey": "agent:main:hapi-openclaw:default:debug-user"
                }
            }
        }
    }
}
```

Current milestone note:

- HAPI official mode should point `OPENCLAW_PLUGIN_BASE_URL` at the OpenClaw Gateway base URL
- the plugin route surface is native now
- `ensure-default-conversation` and `send-message` use the real OpenClaw runtime now
- assistant replies in HAPI come from real OpenClaw transcript updates, not mock text
- approval request / approve / deny bridging is still not implemented in this milestone

Handoff status:

- real V1 message flow was validated against a real OpenClaw Gateway and real HAPI official-mode hub
- npm-installed plugin loaded successfully, `/hapi/*` routes were active, and both transcript services started inside the Gateway
- real `send-message` now reaches `runEmbeddedPiAgent(...)` with explicit runtime config, agent dir, provider, and model
- assistant replies reached HAPI through the transcript bridge after cleaning stale HAPI conversation rows created before deterministic session keys landed

What changed during real integration:

- config resolution now prefers `api.runtime.config.loadConfig()`, then falls back to `api.config` and `api.pluginConfig`
- long-lived services now receive the same parsed plugin config instead of silently reading incomplete config
- provider/model are resolved from real OpenClaw agent/default config and passed explicitly into the embedded run
- deterministic session keys are used consistently for plugin-owned HAPI conversations

Known cleanup note:

- older HAPI rows may still point at legacy OpenClaw external ids such as `openclaw:default:1`
- symptom: OpenClaw logs show `run completed`, but HAPI does not show the assistant reply in the expected thread
- current workaround: clean the stale HAPI OpenClaw conversation rows in `~/.hapi/hapi.db`, then resend the message

Still missing:

- real approval request translation and approve/deny resolution; current endpoints still return `501`
- durable idempotency and callback retry state in plugin-owned persistent storage
- automatic migration or self-heal for stale HAPI `external_id` rows created by older plugin builds
