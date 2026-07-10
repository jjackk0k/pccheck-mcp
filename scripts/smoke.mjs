#!/usr/bin/env node
// Smoke test: spawns the built server and exercises every tool over real stdio JSON-RPC.
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "index.js");
const only = process.argv[2]; // optional: run a single tool

const CALLS = [
  ["system_overview", {}],
  ["battery_health", {}],
  ["gpu_info", {}],
  ["temperatures", {}],
  ["performance_snapshot", {}],
  ["top_processes", { filter: "node", limit: 5 }],
  ["disk_space", {}],
  ["startup_programs", {}],
  ["installed_software", { limit: 10 }],
  ["crash_report", {}],
  ["network_check", {}],
  ["scan_folder_sizes", { path: path.join(os.homedir(), "Downloads"), time_budget_seconds: 10 }],
  ["speed_test", { seconds: 5 }],
  ["what_changed", {}],
  ["what_changed", {}],
  ["full_checkup", {}],
].filter(([name]) => !only || name === only);

if (only && CALLS.length === 0) {
  console.error(`Unknown tool "${only}" — nothing to test.`);
  process.exit(2);
}

const child = spawn("node", [entry], { stdio: ["pipe", "pipe", "pipe"] });
child.stderr.on("data", () => {}); // startup banner — ignore

let buffer = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buffer += d.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      console.error("UNPARSEABLE LINE:", line.slice(0, 200));
    }
  }
});

let nextId = 1;
function request(method, params, timeoutMs = 90_000) {
  const id = nextId++;
  const p = new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(t);
      resolve(msg);
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return p;
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const failures = [];
try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.1" },
  });
  console.log(`initialize OK -> server ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  notify("notifications/initialized");

  const list = await request("tools/list", {});
  const tools = list.result.tools;
  console.log(`tools/list OK -> ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
  for (const t of tools) {
    const props = Object.keys(t.inputSchema?.properties ?? {});
    if (["top_processes", "scan_folder_sizes", "installed_software"].includes(t.name) && props.length === 0) {
      failures.push(`${t.name}: input schema has NO properties (zod conversion problem)`);
    }
  }

  for (const [name, args] of CALLS) {
    const started = Date.now();
    try {
      const res = await request("tools/call", { name, arguments: args }, 120_000);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (res.error) {
        failures.push(`${name}: RPC error ${JSON.stringify(res.error).slice(0, 200)}`);
        console.log(`FAIL ${name} (${secs}s): ${JSON.stringify(res.error).slice(0, 200)}`);
        continue;
      }
      const content = res.result?.content?.[0]?.text ?? "";
      const isErr = res.result?.isError;
      const status = isErr ? "TOOL-ERROR" : "ok";
      if (isErr) failures.push(`${name}: ${content.slice(0, 200)}`);
      console.log(`${status} ${name} (${secs}s, ${content.length} chars)`);
      const preview = process.env.SMOKE_FULL ? content : content.slice(0, 500);
      console.log(preview.split("\n").map((l) => "   | " + l).join("\n"));
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }
} finally {
  child.kill();
}

console.log("\n=== SMOKE RESULT ===");
if (failures.length) {
  console.log(`${failures.length} failure(s):`);
  for (const f of failures) console.log(" - " + f);
  process.exit(1);
} else {
  console.log("ALL PASS");
}
