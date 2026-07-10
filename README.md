# 🩺 PCCheck — let Claude actually check your PC

**Ask Claude "why is my PC slow?" and get a real answer — not generic advice.**

PCCheck is an MCP server that gives Claude read-only eyes into your computer: hardware specs, live CPU/GPU/RAM load, temperatures, disk space hogs, startup bloat, crash history, and wifi quality. Claude stops guessing and starts diagnosing.

> 🧑‍⚕️ *"Your GPU is fine and your CPU is idling — but Chrome is holding 9GB of RAM, your C: drive is 96% full, and there's a 20GB VM image in Downloads you probably forgot about. Delete that and you'll feel the difference."*
> — the kind of answer this unlocks

## What you can ask

- 🔍 **"Run a full checkup on my PC"**
- 🐌 "Why is my computer so slow *right now*?"
- 💾 "What's eating my disk space?"
- 🎮 "Can my PC run Cyberpunk 2077 at 1440p?"
- 💥 "Why did my PC crash yesterday?"
- 📶 "Is my wifi the problem, or my internet provider?"
- 🔥 "Is my PC running too hot?"
- 🧹 "Roast my startup programs."
- 🔋 "Should I replace my laptop battery?"

## Install

### Option 1 — Claude Desktop, one click (recommended)

1. Download `pccheck.mcpb` from the [latest release](https://github.com/YOUR-GITHUB-USERNAME/pccheck-mcp/releases/latest)
2. Double-click it (or drag into Claude Desktop → Settings → Extensions)
3. Click **Install**. Done — no terminal, no Node.js, nothing else to set up.

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

| Tool | Answers |
|---|---|
| `full_checkup` | "Check my PC" — everything below in one call, ~20s |
| `system_overview` | "What are my specs?" / "Can I run this game?" |
| `performance_snapshot` | "Why is it slow right now?" — live load + top processes |
| `top_processes` | "How much is Chrome using?" |
| `gpu_info` | GPU model, VRAM, driver, live utilization, display refresh rates |
| `temperatures` | "Is it running hot?" — CPU/GPU temps + healthy ranges |
| `disk_space` | Drive fullness + SSD/HDD health (SMART) |
| `scan_folder_sizes` | "What's eating my disk?" — ranks folders by size |
| `startup_programs` | Boot bloat, including which items are actually enabled |
| `network_check` | Router vs internet pings — separates "bad wifi" from "bad ISP" |
| `crash_and_health_report` | Blue screens, app crashes, antivirus, pending reboots |
| `installed_software` | Biggest / most recent installs — find the bloat |
| `battery_health` | Wear level, cycle count, charge state |

## Privacy & safety

- **100% read-only.** There is no tool that can change, delete, install, or configure anything. The worst PCCheck can do is *look*.
- **Nothing leaves your machine.** No telemetry, no accounts, no external APIs. The only network activity is the ping test in `network_check` (standard pings to your router, `1.1.1.1`, and `8.8.8.8`).
- **No admin rights needed.** Everything works as a normal user (Windows hides CPU temperature from non-admin processes — GPU temp still works).
- You see every tool call in Claude before results are used, like any MCP server.

## Troubleshooting

- **"CPU temperature unavailable"** — Windows blocks this for non-admin processes; it's expected. GPU temperature (NVIDIA) still works.
- **Claude Desktop doesn't show the tools** — fully quit Claude Desktop (system tray → Quit) and reopen; extensions load at startup.
- **`npx` install fails on Windows** — use the `cmd /c` variant shown above, or the `.mcpb` file which needs no Node at all.
- **A tool times out** — each tool is time-boxed; just call it again, or use a smaller scope (e.g. scan a subfolder instead of all of `C:\`).

## Development

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/pccheck-mcp
cd pccheck-mcp
npm install
npm run build
npm run smoke   # exercises all 13 tools over real stdio JSON-RPC
```

## Roadmap

- Windows Task Scheduler startup entries
- Deeper macOS/Linux parity (startup items, installed apps with sizes)
- Optional LibreHardwareMonitor bridge for full sensor data (CPU temp without admin)
- Driver-age check against NVIDIA/AMD release feeds
- "What changed since yesterday?" snapshot diffing

## License

MIT — see [LICENSE](LICENSE).

---

*Built for the person whose family asks them to fix the computer. Now Claude can be that person.*
