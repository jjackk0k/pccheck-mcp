#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { safe, text } from "./util.js";
import { fullCheckup } from "./tools/checkup.js";
import { systemOverview, batteryHealth } from "./tools/overview.js";
import { performanceSnapshot, topProcesses } from "./tools/performance.js";
import { gpuInfo, temperatures } from "./tools/gpu.js";
import { diskSpace, scanFolderSizes } from "./tools/disks.js";
import { startupPrograms } from "./tools/startup.js";
import { networkCheck } from "./tools/network.js";
import { crashAndHealthReport } from "./tools/health.js";
import { installedSoftware } from "./tools/software.js";
import { speedTest } from "./tools/speedtest.js";
import { whatChanged } from "./tools/changes.js";

const VERSION = "0.3.0";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    `pccheck-mcp v${VERSION} — read-only PC diagnostics over MCP (stdio)\n` +
      `Not meant to be run by hand: point your MCP client at this binary.\n` +
      `Docs: https://github.com/jjackk0k/pccheck-mcp`,
  );
  process.exit(0);
}

const server = new McpServer(
  { name: "pccheck", version: VERSION },
  {
    instructions:
      "PCCheck gives you read-only visibility into this computer's hardware and health. " +
      "For a vague complaint ('my PC is slow'), start with full_checkup or performance_snapshot. " +
      "Present results as a friendly diagnosis: verdict first, then evidence in plain language. " +
      "Numbers alone mean nothing to most users — always interpret them. " +
      "Gaming complaints (stutter, low FPS, crashes in games): call performance_snapshot + temperatures + gpu_info together. " +
      "'How fast is my internet' → speed_test; 'why is my internet broken/laggy' → network_check. " +
      "'It got slower recently / after some update' → what_changed. " +
      "These tools NEVER change anything; when a fix is needed, explain how the user can do it themselves.",
  },
);

const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

server.registerTool(
  "full_checkup",
  {
    title: "Full PC checkup",
    description:
      "Run a complete PC health checkup in one call: hardware specs, live CPU/RAM/GPU load, temperatures, disk space + disk health, crash history, antivirus status, startup programs, and network. Use for 'check my PC', 'why is my PC slow', 'is my computer healthy', or any broad diagnostic request. Takes ~20-30 seconds.",
    annotations: RO,
  },
  safe(async () => text(await fullCheckup(), true)),
);

server.registerTool(
  "system_overview",
  {
    title: "System overview",
    description:
      "Hardware specs and identity: OS version, CPU model/cores, RAM, GPU(s) + VRAM, displays with refresh rate, drives with free space, uptime. Use for 'what are my specs', 'what PC do I have', or to check specs against a game/app's requirements ('can I run X?').",
    annotations: RO,
  },
  safe(async () => text(await systemOverview())),
);

server.registerTool(
  "performance_snapshot",
  {
    title: "Performance snapshot",
    description:
      "Live performance right now: overall + per-core CPU load, RAM usage and pressure, GPU utilization, and the top processes by CPU and by memory. Use when the PC is slow, laggy, or freezing RIGHT NOW, or when games stutter or drop FPS, to find what's hogging resources.",
    annotations: RO,
  },
  safe(async () => text(await performanceSnapshot())),
);

server.registerTool(
  "top_processes",
  {
    title: "Top processes",
    description:
      "List running processes sorted by CPU or memory, optionally filtered by name (e.g. 'chrome'). Use to dig into a specific app's resource usage or count how many instances of something are running.",
    inputSchema: {
      sort_by: z.enum(["cpu", "memory"]).optional().describe("Sort order (default cpu)"),
      limit: z.number().int().min(1).max(50).optional().describe("How many to return (default 15)"),
      filter: z.string().optional().describe("Only processes whose name/path contains this text"),
    },
    annotations: RO,
  },
  safe(async (args: { sort_by?: "cpu" | "memory"; limit?: number; filter?: string }) => text(await topProcesses(args))),
);

server.registerTool(
  "gpu_info",
  {
    title: "GPU & display info",
    description:
      "Graphics card details (model, VRAM, driver version), live NVIDIA stats (utilization, VRAM in use, power), and connected displays with resolution + refresh rate. Use for gaming performance questions, driver checks, and 'is my monitor set up right'.",
    annotations: RO,
  },
  safe(async () => text(await gpuInfo())),
);

server.registerTool(
  "temperatures",
  {
    title: "Temperatures & cooling",
    description:
      "CPU and GPU temperatures, fan speed, and healthy-range reference. Use when the PC is hot, loud, throttling, or shutting down under load. (Windows often hides CPU temp from non-admin processes — GPU temp still works.)",
    annotations: RO,
  },
  safe(async () => text(await temperatures())),
);

server.registerTool(
  "disk_space",
  {
    title: "Disk space & health",
    description:
      "All drives with size/free space plus physical disk health (SSD vs HDD, SMART status). Use for 'disk full', 'how much space do I have', or suspected failing drive. To find WHAT is taking space, follow up with scan_folder_sizes.",
    annotations: RO,
  },
  safe(async () => text(await diskSpace())),
);

server.registerTool(
  "scan_folder_sizes",
  {
    title: "Find space hogs",
    description:
      "Scan a folder and rank its subfolders by total size, plus the largest individual files. Use to answer 'what is eating my disk space?' — start with the user's home folder (the default), then drill into the biggest subfolder. Time-boxed; big trees may need a longer budget.",
    inputSchema: {
      path: z.string().optional().describe("Folder to scan (default: the user's home folder)"),
      top: z.number().int().min(3).max(30).optional().describe("How many folders to return (default 12)"),
      time_budget_seconds: z.number().int().min(3).max(60).optional().describe("Max scan time (default 15)"),
    },
    annotations: RO,
  },
  safe(async (args: { path?: string; top?: number; time_budget_seconds?: number }) => text(await scanFolderSizes(args))),
);

server.registerTool(
  "startup_programs",
  {
    title: "Startup programs",
    description:
      "Programs that launch at boot, including whether each is enabled or disabled. Use for 'PC boots slowly', 'too much stuff running', or general debloating. Read-only — tells the user how to disable items themselves.",
    annotations: RO,
  },
  safe(async () => text(await startupPrograms())),
);

server.registerTool(
  "network_check",
  {
    title: "Network & wifi check",
    description:
      "Diagnose the internet connection: active adapters, wifi signal quality, ping to the router vs the internet (separates 'my wifi is bad' from 'my ISP is down'), DNS speed, and a plain-language diagnosis. Measures latency and packet loss, not download speed in Mbps. Use for slow internet, lag, or connection drops.",
    annotations: RO,
  },
  safe(async () => text(await networkCheck())),
);

server.registerTool(
  "crash_report",
  {
    title: "Crash history & stability",
    description:
      "Windows stability report: blue screens and unexpected shutdowns (last 30 days), app crashes (last 14 days), antivirus status, pending-reboot state, and disk SMART health. Use for crashes, freezes, random restarts, blue screens, or 'my PC turned itself off'.",
    annotations: RO,
  },
  safe(async () => text(await crashAndHealthReport())),
);

server.registerTool(
  "installed_software",
  {
    title: "Installed software",
    description:
      "Installed programs with size, publisher, and install date — sorted by size by default (great for finding bloat) or by 'recent' (great for 'my PC got slow after installing something'). Filterable by name.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("How many to return (default 25)"),
      filter: z.string().optional().describe("Only programs whose name/publisher contains this text"),
      sort_by: z.enum(["size", "name", "recent"]).optional().describe("Sort order (default size)"),
    },
    annotations: RO,
  },
  safe(async (args: { limit?: number; filter?: string; sort_by?: "size" | "name" | "recent" }) =>
    text(await installedSoftware(args)),
  ),
);

server.registerTool(
  "what_changed",
  {
    title: "What changed on this PC?",
    description:
      "Compare the PC now vs the previous run of this tool: disk-space changes, programs installed/removed/updated, new startup items, GPU-driver and Windows updates. Use for 'my PC got slower recently', 'what changed after that update', or periodic checkups. The first run saves a baseline; each later run diffs against the last and rolls it forward. This is the only PCCheck tool that writes anything: one snapshot file in ~/.pccheck (delete it anytime).",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  safe(async () => text(await whatChanged())),
);

server.registerTool(
  "speed_test",
  {
    title: "Internet speed test",
    description:
      "Measure actual download speed in Mbps (plus time-to-first-byte). Use when the user asks 'how fast is my internet' or says speeds don't match what they pay for. Downloads throwaway test data from Cloudflare's public speed endpoint — nothing is uploaded. Takes ~8-10 seconds. For connection problems (drops, lag, 'wifi vs ISP'), use network_check instead.",
    inputSchema: {
      seconds: z.number().int().min(3).max(20).optional().describe("Test duration (default 8)"),
    },
    annotations: { ...RO, openWorldHint: true },
  },
  safe(async (args: { seconds?: number }) => text(await speedTest(args))),
);

server.registerTool(
  "battery_health",
  {
    title: "Battery health",
    description:
      "Laptop battery status: charge, charging state, cycle count, and health (current max capacity vs designed). Use for 'battery drains fast' or 'should I replace my battery'. Reports cleanly if there is no battery.",
    annotations: RO,
  },
  safe(async () => text(await batteryHealth())),
);

// Prompts appear in Claude Desktop's "+" menu — one-click entry points for non-technical users.
const prompt = (textBody: string) => () => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text: textBody } }],
});

server.registerPrompt(
  "full-checkup",
  { title: "Full PC checkup", description: "Complete health check with a friendly diagnosis" },
  prompt(
    "Run a full checkup on my PC using the pccheck tools. Present it like a friendly PC technician: overall verdict first, then key findings in plain language (no raw JSON), then a prioritized list of fixes I can do myself.",
  ),
);

server.registerPrompt(
  "why-is-my-pc-slow",
  { title: "Why is my PC slow?", description: "Find what's slowing this computer down right now" },
  prompt(
    "My PC feels slow. Use the pccheck tools to find out why — check live performance first, then anything else the evidence points to (disk space, temperatures, startup bloat). Tell me the most likely cause in plain language and exactly how to fix it myself.",
  ),
);

server.registerPrompt(
  "free-up-space",
  { title: "Free up disk space", description: "Find what's eating the disk and what's safe to remove" },
  prompt(
    "Help me free up disk space. Use the pccheck tools to see how full my drives are and what's taking the space (scan my biggest folders, check installed programs by size). Then give me a safe cleanup list — biggest wins first, and warn me about anything I shouldn't delete.",
  ),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`pccheck-mcp v${VERSION} running (read-only diagnostics)`);
}

main().catch((e) => {
  console.error("pccheck-mcp failed to start:", e);
  process.exit(1);
});
