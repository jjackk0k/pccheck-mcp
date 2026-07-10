# Changelog

## 0.3.0 — 2026-07-10

- **New tool: `what_changed`** — snapshot diffing: disk-space deltas, programs installed/removed/updated, new startup items, GPU-driver and Windows-build changes since the last run. First run saves a baseline to `~/.pccheck` (the only file PCCheck ever writes).
- **`startup_programs` now includes Task Scheduler logon/boot tasks** (non-Microsoft) — a whole class of boot bloat that Task Manager's Startup tab doesn't show.
- **`performance_snapshot` gained bottleneck analysis** — cross-references CPU saturation, single-core limits, RAM pressure/swapping, GPU utilization, and VRAM fullness into plain-language verdicts.

## 0.2.0 — 2026-07-10

- **New tool: `speed_test`** — actual download Mbps via Cloudflare's public speed endpoint (download-only, disclosed in privacy docs)
- **MCP prompts** — *Full PC checkup*, *Why is my PC slow?*, *Free up disk space* appear in Claude Desktop's + menu
- Renamed `crash_and_health_report` → `crash_report`; clearer routing cues for freezes, game stutter, and "loud fan" complaints
- Network diagnosis no longer blames "local problem" when a router merely blocks ping; wifi-signal blame only applies when traffic actually routes over wifi; DNS lookup time-boxed
- Startup programs: disabled startup-folder items are now detected correctly (`.lnk` name matching, case-insensitive)
- Folder scanner enforces its time budget in all paths (large flat folders, queued walks)
- `--version` / `--help` CLI flags; icon; compact `full_checkup` output (~22% fewer tokens); honest "What Claude sees" privacy table; CI (build + smoke on Windows & Linux)

## 0.1.0 — 2026-07-10

Initial release.

- 13 read-only diagnostic tools: `full_checkup`, `system_overview`, `performance_snapshot`, `top_processes`, `gpu_info`, `temperatures`, `disk_space`, `scan_folder_sizes`, `startup_programs`, `network_check`, `crash_and_health_report`, `installed_software`, `battery_health`
- Windows-first (event logs, Defender status, startup enabled/disabled state, registry software list), with cross-platform basics via `systeminformation`
- Live NVIDIA GPU stats via `nvidia-smi`
- Router-vs-internet network diagnosis with plain-language hints
- Time-boxed, concurrency-limited folder size scanner
- Every tool annotated `readOnlyHint`; all output token-lean JSON
