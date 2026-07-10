import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { asArray, isMac, isWindows, psJson, run } from "../util.js";

interface WinStartupItem {
  Name: string;
  Command: string;
  Location: string;
  User: string;
}

interface WinStartupPayload {
  items: WinStartupItem | WinStartupItem[];
  approved: Record<string, boolean>;
}

const WIN_SCRIPT = `
$items = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Select-Object Name, Command, Location, User)
$approved = @{}
foreach ($rk in @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
)) {
  if (Test-Path $rk) {
    $k = Get-Item $rk
    foreach ($n in $k.GetValueNames()) {
      $v = $k.GetValue($n)
      if ($v -is [byte[]] -and $v.Length -gt 0) { $approved[$n] = ($v[0] % 2 -eq 0) }
    }
  }
}
@{ items = $items; approved = $approved } | ConvertTo-Json -Depth 4
`.trim();

const TASKS_SCRIPT = `
try {
  $tasks = Get-ScheduledTask -ErrorAction Stop | Where-Object {
    $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft\\*' -and
    ($_.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -or $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' })
  } | Select-Object TaskName, TaskPath, @{n='State';e={$_.State.ToString()}}, @{n='Author';e={$_.Author}}
  if ($tasks) { $tasks | ConvertTo-Json -Depth 2 } else { '[]' }
} catch { 'null' }
`.trim();

interface WinScheduledTask {
  TaskName: string;
  TaskPath: string;
  State: string;
  Author: string | null;
}

export async function startupPrograms() {
  if (isWindows) {
    const [payload, schedTasks] = await Promise.all([
      psJson<WinStartupPayload>(WIN_SCRIPT, 20_000),
      psJson<WinScheduledTask | WinScheduledTask[]>(TASKS_SCRIPT, 25_000),
    ]);
    if (!payload) return { error: "Could not read startup programs (PowerShell query failed)." };

    // Registry names are case-insensitive, and StartupApproved\StartupFolder keys
    // include the shortcut extension (".lnk") while Win32_StartupCommand names don't.
    const approved = new Map<string, boolean>();
    for (const [k, v] of Object.entries(payload.approved ?? {})) approved.set(k.toLowerCase(), v);
    const lookupEnabled = (name: string) =>
      approved.get(name.toLowerCase()) ?? approved.get(name.toLowerCase() + ".lnk");

    const items = asArray(payload.items).map((i) => {
      const enabled = lookupEnabled(i.Name) ?? true;
      return {
        name: i.Name,
        enabled,
        command: (i.Command ?? "").slice(0, 140) || undefined,
        location: i.Location?.includes("Startup") ? "Startup folder" : i.Location,
        user: i.User || undefined,
      };
    });
    items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));

    const enabledCount = items.filter((i) => i.enabled).length;
    const scheduledTasks = asArray(schedTasks).map((t) => ({
      name: t.TaskName,
      path: t.TaskPath,
      state: t.State,
      author: t.Author || undefined,
    }));
    return {
      enabledCount,
      disabledCount: items.length - enabledCount,
      items,
      scheduledTasksAtLogon: scheduledTasks.length
        ? scheduledTasks
        : "None found outside Microsoft's own (or query unavailable)",
      note: "Each enabled item adds to boot time and background load. Users can toggle startup apps in Task Manager > Startup apps; scheduled tasks live in Task Scheduler. This tool only reads them.",
    };
  }

  if (isMac) {
    const r = await run(
      "osascript",
      ["-e", 'tell application "System Events" to get the name of every login item'],
      8000,
    );
    if (r.ok) {
      const items = r.out.trim().split(",").map((s) => s.trim()).filter(Boolean);
      return { enabledCount: items.length, items: items.map((name) => ({ name, enabled: true })) };
    }
    return { error: "Could not read login items (may need Automation permission for System Events)." };
  }

  // Linux: freedesktop autostart entries
  const dir = path.join(os.homedir(), ".config", "autostart");
  try {
    const files = await fs.readdir(dir);
    const items = files.filter((f) => f.endsWith(".desktop")).map((f) => ({ name: f.replace(/\.desktop$/, ""), enabled: true }));
    return { enabledCount: items.length, items, note: `From ${dir}` };
  } catch {
    return { enabledCount: 0, items: [], note: "No autostart entries found." };
  }
}
