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

export async function startupPrograms() {
  if (isWindows) {
    const payload = await psJson<WinStartupPayload>(WIN_SCRIPT, 20_000);
    if (!payload) return { error: "Could not read startup programs (PowerShell query failed)." };

    const approved = payload.approved ?? {};
    const items = asArray(payload.items).map((i) => {
      const enabled = approved[i.Name] ?? true;
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
    return {
      enabledCount,
      disabledCount: items.length - enabledCount,
      items,
      note: "Each enabled item adds to boot time and background load. Users can toggle these in Task Manager > Startup apps — this tool only reads them.",
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
