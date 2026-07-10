# Changelog

## 0.1.0 — 2026-07-10

Initial release.

- 13 read-only diagnostic tools: `full_checkup`, `system_overview`, `performance_snapshot`, `top_processes`, `gpu_info`, `temperatures`, `disk_space`, `scan_folder_sizes`, `startup_programs`, `network_check`, `crash_and_health_report`, `installed_software`, `battery_health`
- Windows-first (event logs, Defender status, startup enabled/disabled state, registry software list), with cross-platform basics via `systeminformation`
- Live NVIDIA GPU stats via `nvidia-smi`
- Router-vs-internet network diagnosis with plain-language hints
- Time-boxed, concurrency-limited folder size scanner
- Every tool annotated `readOnlyHint`; all output token-lean JSON
