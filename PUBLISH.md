# Publishing playbook — from this folder to actual users

Everything below is ready; the steps marked 🔑 need your accounts/credentials, so Claude can't do them alone (but can do them with you in an interactive session once GitHub/npm are authenticated).

## 0. Replace placeholders (2 minutes)

Search the repo for `YOUR-GITHUB-USERNAME` and replace with your real GitHub username:
- `README.md` (release link, clone URL)
- `server.json` (name + repository URL)
- `package.json` → also update `mcpName` (`io.github.<username>/pccheck-mcp`) and add a `repository` field:
  ```json
  "repository": { "type": "git", "url": "git+https://github.com/<username>/pccheck-mcp.git" }
  ```

## 1. 🔑 GitHub repo

```bash
gh auth login                      # once
gh repo create pccheck-mcp --public --source . --push
```

## 2. 🔑 npm publish (unlocks `npx pccheck-mcp` for everyone)

```bash
npm login                          # once — needs an npmjs.com account
npm publish                        # runs the build automatically (prepublishOnly)
```

## 3. GitHub release with the one-click installer

```bash
node scripts/bundle.mjs            # produces pccheck.mcpb
gh release create v0.1.0 pccheck.mcpb --title "PCCheck v0.1.0" --notes "First release — 13 read-only PC diagnostic tools for Claude. Download pccheck.mcpb and double-click to install into Claude Desktop."
```

## 4. Official MCP registry (aggregators auto-ingest from here)

```bash
# install mcp-publisher (Windows): download from https://github.com/modelcontextprotocol/registry/releases
mcp-publisher login github         # device-flow OAuth, no secrets stored
mcp-publisher publish              # uses server.json
```

## 5. Directories (free distribution, ~15 min total)

- **Anthropic extension directory** — submission form linked from https://www.anthropic.com/engineering/desktop-extensions (requirements already met: read-only annotations on every tool, titles, privacy section in README)
- **PulseMCP** — auto-ingests the official registry; can also submit at https://www.pulsemcp.com/submit
- **mcp.so** — Submit button (GitHub URL)
- **Smithery** — https://smithery.ai → claim the listing once it crawls GitHub

## 6. Launch posts (the actual growth lever)

Suggested venues, in order of expected impact:
1. **r/ClaudeAI** — title idea: *"I made Claude able to answer 'why is my PC slow?' — free, open-source, one-click install, 100% read-only"*
2. **X/Twitter** — short demo clip of asking Claude "run a full checkup on my PC" and getting the diagnosis
3. **Hacker News (Show HN)** — *"Show HN: PCCheck – an MCP server that lets Claude diagnose your PC"*
4. **r/pcmasterrace / r/techsupport** — angle: "let AI read your actual temps/crash logs instead of pasting screenshots"

The demo GIF matters more than the text. Record: ask "why is my PC slow?" → Claude calls tools → verdict with real numbers.

## Update loop (every release)

1. Bump `version` in `package.json`, `manifest.json`, `server.json`, `src/index.ts` (VERSION), add a `CHANGELOG.md` entry
2. `npm run build && npm run smoke` — all 13 tools must pass
3. `npm publish`
4. `node scripts/bundle.mjs` → `gh release create vX.Y.Z pccheck.mcpb ...`
5. `mcp-publisher publish`
