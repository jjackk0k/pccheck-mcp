# PCCheck roadmap & session handoff

Working doc for whoever (human or Claude session) picks this up next. Keep it current.

## State as of 2026-07-10 (evening)

- **v0.2.0 PUBLISHED: https://github.com/jjackk0k/pccheck-mcp** — release v0.2.0 with `pccheck.mcpb` (3.5MB) attached, repo topics set
- 14 tools smoke-tested green (`npm run smoke`), incl. new `speed_test` (chunked Cloudflare downloads — single big requests 403)
- 3 MCP prompts for Claude Desktop's + menu; `--version`/`--help`; icon; README with logo/badges/honest privacy table
- Wired into Jack's Claude Code (user scope) + Claude Desktop config
- CI staged in `.github/workflows-pending/` — Jack's gh token lacks `workflow` scope (activation steps at top of PUBLISH.md)

## Next up (rough priority)

1. **Jack, 5 min:** `gh auth refresh -h github.com -s workflow` → activate CI (PUBLISH.md top) — green badge = trust
2. **Jack, 10 min:** `npm login` + `npm publish` (unlocks `npx pccheck-mcp`), then `mcp-publisher` registry publish (PUBLISH.md)
3. **Demo assets**: GIF of "why is my PC slow?" → diagnosis (spec in PUBLISH.md); screenshots for README
4. **Directory submissions** after npm: Anthropic extension directory, PulseMCP, mcp.so, Smithery (PUBLISH.md step 6)
5. **Landing page**: single-page site (GitHub Pages) with the pitch + install buttons
6. Windows Task Scheduler startup entries in `startup_programs`
7. macOS/Linux parity pass (installed apps with sizes, login items polish; mac System Events permission popup needs a graceful pre-note)
8. "What changed since last checkup?" — cache last full_checkup to `~/.pccheck/last.json` (opt-in, still read-only wrt the system)
9. LibreHardwareMonitor bridge for CPU temps without admin
10. Localized-Windows hardening (non-English event log / netsh output)

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
