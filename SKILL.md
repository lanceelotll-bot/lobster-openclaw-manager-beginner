---
name: openclaw-manager
description: Use when the user wants to install, configure, troubleshoot, operate, or document 🦞 龙虾 OpenClaw Manager 小白版 or a local OpenClaw control panel, including AI providers, chat channels, usage, memory, cron jobs, startup services, and dashboard links.
---

# 🦞 龙虾 OpenClaw Manager 小白版

Use this skill when working on the 🦞 龙虾 OpenClaw Manager 小白版 repository or when the user wants help with the local OpenClaw management experience.

## Scope

- Install or start the local web manager
- Configure AI providers, models, channels, memory, and cron jobs
- Troubleshoot gateway, bridge, and launch agent issues
- Document the product for non-technical users or GitHub readers

## Preferred workflow

1. Inspect the current local state before changing anything.
2. Prefer the production web entrypoint `http://127.0.0.1:18888/` for normal usage.
3. Use the original OpenClaw console at `http://127.0.0.1:18789/` only when needed.
4. Treat OpenClaw as the underlying runtime and Manager as the control plane.
5. Keep secrets in `~/.openclaw/.env`; do not move live tokens back into user-facing JSON when avoidable.

## Useful checks

- `openclaw health`
- `openclaw models list --json`
- `openclaw channels status --json`
- `openclaw cron status --json`
- `openclaw sessions --json`
- `curl http://127.0.0.1:18888/`

## Key repository entry points

- `web-console/server.mjs`: local bridge and production web host
- `src/components/Dashboard/`: overview UI
- `src/components/Channels/`: channel configuration UI
- `src/components/Cron/`: cron UI
- `src/components/Memory/`: memory UI
- `src-tauri/src/commands/config.rs`: Tauri config, usage, and cron commands

## Documentation guidance

- Keep `README.md` human-facing, bilingual, and understandable for non-technical users.
- Keep `SKILL.md` concise and operational.
- When describing installation, separate normal web usage from Tauri desktop development.
- Mention that the web manager is local-only by default and depends on OpenClaw.
- Explicitly distinguish `skill`, `Manager`, and `OpenClaw runtime` so users do not confuse workflow knowledge with live capability.
- Include the original project link and a short thanks note when preparing public-facing repository copy.
- When documenting memory metrics, clearly separate `real prompt injections`, `related-hit sidecar audit`, and `potential token savings`; do not describe all three as the same kind of truth.
- Keep technical identifiers such as the skill slug `openclaw-manager` stable unless there is a clear migration plan.
- For user-visible repository updates, bump the app version and keep version files synchronized.
