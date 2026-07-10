# PCCheck roadmap & session handoff

Working doc for whoever (human or Claude session) picks this up next. Keep it current.

## State as of 2026-07-10

- v0.1.0 built, all 13 tools smoke-tested green on Windows 11 (`npm run smoke`)
- Wired into Jack's Claude Code (user scope) + Claude Desktop config
- `pccheck.mcpb` one-click bundle packs clean (3.4MB) via `node scripts/bundle.mjs`
- NOT yet published: needs Jack's GitHub + npm accounts (see PUBLISH.md, incl. placeholder replacement)

## Next up (rough priority)

1. **Internet speed test tool** (download Mbps + disclosed clearly in privacy section) — UX review says this is the #1 feature users will ask for
2. **Demo assets**: GIF of "why is my PC slow?" → diagnosis (spec in PUBLISH.md step 1); screenshots for README
3. **Landing page**: single-page site (GitHub Pages) with the pitch + install buttons
4. **Publish** (blocked on Jack: GitHub repo, npm account, then registry + directories — PUBLISH.md)
5. Windows Task Scheduler startup entries in `startup_programs`
6. macOS/Linux parity pass (installed apps with sizes, login items polish; mac System Events permission popup needs a graceful pre-note)
7. "What changed since last checkup?" — cache last full_checkup to `~/.pccheck/last.json` (opt-in, still read-only wrt the system)
8. LibreHardwareMonitor bridge for CPU temps without admin
9. Localized-Windows hardening (non-English event log / netsh output)

## Done

- 2026-07-10: v0.1.0 — 13 tools built, smoke-tested 13/13, .mcpb packs clean, wired into Jack's Claude Code + Desktop
- 2026-07-10: Correctness review applied (router-blocks-ping false diagnosis, .lnk startup-state matching — verified live, scanner deadline enforcement, withTimeout timer leak, dns time-box, onWifi ethernet-docked fix, 60Hz false positive)
- 2026-07-10: UX review applied (honest "What Claude sees" privacy table, Desktop-app prerequisite + verify step, FAQ + uninstall, Windows-first platform column, crash_and_health_report → crash_report + freezes cue, gaming multi-tool routing, launch-venue fixes, icon.png generated + wired into manifest/bundle, compact JSON for full_checkup)

## Session log

## Design principles (don't drift)

- **Read-only forever.** The moment a tool can change something, the trust story dies.
- **Diagnosis over data dumps** — every tool interprets (warnings, hints, healthy ranges), Claude narrates.
- **Token-lean output** — cap lists, round numbers, omit nulls.
- **Zero-friction install** — .mcpb first, npx second, never "clone and build".
- **Graceful degradation** — every unavailable metric explains *why* and what still works.

## Rhythm for update sessions

1. `npm run build && npm run smoke` must stay green (all 13 tools)
2. Small commits per improvement
3. Version bumps: package.json + manifest.json + server.json + src/index.ts VERSION + CHANGELOG.md
4. Re-pack `.mcpb` after any dist change: `node scripts/bundle.mjs`
