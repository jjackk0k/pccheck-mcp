# 🩺 PCCheck — let Claude actually check your PC

**Ask Claude "why is my PC slow?" and get a real answer — not generic advice.**

PCCheck is an MCP server that gives Claude read-only eyes into your computer: hardware specs, live CPU/GPU/RAM load, temperatures, disk space hogs, startup bloat, crash history, and wifi quality. Claude stops guessing and starts diagnosing.

<!-- DEMO GIF GOES HERE — 15-25s: type "why is my PC slow?", tool calls fire, verdict appears. See PUBLISH.md step 1. -->

> 🧑‍⚕️ *"Your GPU is fine and your CPU is idling — but Chrome is holding 9GB of RAM, your C: drive is 96% full, and there's a 20GB VM image in Downloads you probably forgot about. Delete that and you'll feel the difference."*
> — the kind of answer this unlocks

## What you can ask

- 🔍 **"Run a full checkup on my PC"**
- 🐌 "Why is my computer so slow *right now*?"
- 💾 "What's eating my disk space?"
- 🎮 "Can my PC run Cyberpunk 2077 at 1440p?" / "Why does my game stutter?"
- 💥 "Why did my PC crash yesterday?"
- 📶 "Is my wifi the problem, or my internet provider?"
- 🔥 "Is my PC running too hot?"
- 🧹 "Roast my startup programs."
- 🔋 "Should I replace my laptop battery?"

## What you need

The **Claude Desktop app** (Windows or Mac — the free plan works) or **Claude Code**. The claude.ai website and the mobile app can't run local extensions — they can't see your PC.

PCCheck is **Windows-first** (crash logs, antivirus status, startup toggles are Windows-only for now); specs, performance, disk, and network checks also work on macOS and Linux.

## Install

### Option 1 — Claude Desktop, one click (recommended)

1. Download `pccheck.mcpb` from the [latest release](https://github.com/YOUR-GITHUB-USERNAME/pccheck-mcp/releases/latest)
2. Double-click it (or drag into Claude Desktop → Settings → Extensions)
3. Click **Install**. No terminal, no Node.js, nothing else.

**Check it worked:** ask Claude *"run a full checkup on my PC."* The first time, Claude will ask permission for each tool — click Allow.

### Option 2 — Claude Code (one command)

```bash
claude mcp add pccheck -- npx -y pccheck-mcp
```

### Option 3 — any MCP client (manual config)

```json
{
  "mcpServers": {
    "pccheck": {
      "command": "npx",
      "args": ["-y", "pccheck-mcp"]
    }
  }
}
```

On Windows, if your client needs it: `"command": "cmd", "args": ["/c", "npx", "-y", "pccheck-mcp"]`.

## What Claude sees (13 tools)

| Tool | Answers | Platforms |
|---|---|---|
| `full_checkup` | "Check my PC" — everything below in one call, ~20s | all |
| `system_overview` | "What are my specs?" / "Can I run this game?" | all |
| `performance_snapshot` | "Why is it slow right now?" — live load + top processes | all |
| `top_processes` | "How much is Chrome using?" | all |
| `gpu_info` | GPU model, VRAM, driver, live utilization, display refresh rates | all (live stats: NVIDIA) |
| `temperatures` | "Is it running hot?" — CPU/GPU temps + healthy ranges | all (best on NVIDIA) |
| `disk_space` | Drive fullness + SSD/HDD health (SMART) | all |
| `scan_folder_sizes` | "What's eating my disk?" — ranks folders by size | all |
| `startup_programs` | Boot bloat, including which items are actually enabled | Windows (basic on Mac/Linux) |
| `network_check` | Router vs internet pings — "bad wifi" vs "bad ISP" (latency & loss, not Mbps) | all |
| `crash_report` | Blue screens, freezes, app crashes, antivirus, pending reboots | Windows |
| `installed_software` | Biggest / most recent installs — find the bloat | Windows (names-only on Mac) |
| `battery_health` | Wear level, cycle count, charge state | all |

## Privacy & safety — read this, it's honest

- **100% read-only.** There is no tool that can change, delete, install, or configure anything. The worst PCCheck can do is *look*. (~1,200 lines of TypeScript across 11 files, 3 runtime dependencies — auditable in one sitting.)
- **PCCheck itself sends nothing anywhere.** No telemetry, no accounts, no external APIs. Its only network activity is the latency test in `network_check`: standard pings to your router, `1.1.1.1`, and `8.8.8.8`.
- **But be clear about how MCP works:** results Claude asks for become part of your Claude conversation, which is processed by Anthropic like anything else you type. Depending on what you ask, that can include:

  | If Claude calls… | Your conversation will contain… |
  |---|---|
  | `system_overview` | PC model, hostname, hardware specs |
  | `scan_folder_sizes` | folder/file names (incl. your Windows username in paths) |
  | `installed_software` | names of installed programs |
  | `network_check` | your wifi network name (SSID) |
  | `crash_report` | crash-log excerpts |

  Don't want something seen? Don't ask about it — tools only run when Claude calls them for your request, and you can see every call in the chat.
- **No admin rights needed.** Everything works as a normal user (Windows hides CPU temperature from non-admin processes — GPU temp still works).
- File and program names on your disk are treated as data, not instructions — but as with anything an AI reads, weirdly-named files could try to influence the conversation. Read-only design caps the blast radius.

## FAQ

**Can it delete/change/"fix" things itself?** No. Every tool is read-only by design — Claude diagnoses and tells you how to fix things yourself. That's a feature, not a limitation.

**Does it work on claude.ai in my browser?** No — local extensions need the Claude Desktop app or Claude Code.

**Does the free Claude plan work?** Yes.

**Mac/Linux?** Yes for specs, performance, disk, network, battery. Crash logs, antivirus, and startup-toggle detail are Windows-only right now.

**How do I uninstall?** Claude Desktop: Settings → Extensions → PCCheck → Remove. Claude Code: `claude mcp remove pccheck`.

## Troubleshooting

- **"CPU temperature unavailable"** — Windows blocks this for non-admin processes; it's expected. GPU temperature (NVIDIA) still works.
- **Claude doesn't show the tools** — fully quit Claude Desktop (system tray → Quit) and reopen; extensions load at startup.
- **`npx` install fails on Windows** — use the `cmd /c` variant shown above, or the `.mcpb` file which needs no Node at all.
- **A scan times out** — every tool is time-boxed on purpose; ask Claude to try again with a smaller scope (a subfolder instead of all of `C:\`) or a longer time budget.

## Development

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/pccheck-mcp
cd pccheck-mcp
npm install
npm run build
npm run smoke   # exercises all 13 tools over real stdio JSON-RPC
```

## Roadmap

- **Internet speed test** (download Mbps, clearly disclosed) — most-requested next
- Windows Task Scheduler startup entries
- Deeper macOS/Linux parity (startup items, installed apps with sizes)
- Optional LibreHardwareMonitor bridge for full sensor data (CPU temp without admin)
- "What changed since yesterday?" snapshot diffing

## License

MIT — see [LICENSE](LICENSE).

---

*Built for the person whose family asks them to fix the computer. Now Claude can be that person.*
