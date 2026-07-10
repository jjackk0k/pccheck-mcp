import fs from "node:fs/promises";
import { asArray, isMac, isWindows, psJson } from "../util.js";

interface WinApp {
  DisplayName: string;
  DisplayVersion: string | null;
  Publisher: string | null;
  InstallDate: string | null;
  SizeMB: number | null;
}

const WIN_SCRIPT = `
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and ($_.SystemComponent -ne 1) } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, @{n='SizeMB';e={ if ($_.EstimatedSize) { [math]::Round($_.EstimatedSize/1024) } else { $null } }} |
  ConvertTo-Json -Depth 2
`.trim();

function fmtDate(d: string | null): string | undefined {
  if (!d || !/^\d{8}$/.test(d)) return undefined;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function installedSoftware(args: { limit?: number; filter?: string; sort_by?: "size" | "name" | "recent" }) {
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const filter = args.filter?.toLowerCase();
  const sortBy = args.sort_by ?? "size";

  if (isWindows) {
    const raw = await psJson<WinApp | WinApp[]>(WIN_SCRIPT, 30_000);
    if (!raw) return { error: "Could not read installed programs from the registry." };

    // Dedupe by name (32/64-bit keys overlap), keeping the entry with more info
    const byName = new Map<string, WinApp>();
    for (const app of asArray(raw)) {
      const existing = byName.get(app.DisplayName);
      if (!existing || (app.SizeMB ?? 0) > (existing.SizeMB ?? 0)) byName.set(app.DisplayName, app);
    }
    let apps = [...byName.values()];
    const totalCount = apps.length;

    if (filter) {
      apps = apps.filter(
        (a) => a.DisplayName.toLowerCase().includes(filter) || a.Publisher?.toLowerCase().includes(filter),
      );
    }

    apps.sort((a, b) => {
      if (sortBy === "name") return a.DisplayName.localeCompare(b.DisplayName);
      if (sortBy === "recent") return (b.InstallDate ?? "").localeCompare(a.InstallDate ?? "");
      return (b.SizeMB ?? 0) - (a.SizeMB ?? 0);
    });

    return {
      totalInstalled: totalCount,
      matching: apps.length,
      sortedBy: sortBy,
      programs: apps.slice(0, limit).map((a) => ({
        name: a.DisplayName,
        sizeMB: a.SizeMB ?? undefined,
        publisher: a.Publisher ?? undefined,
        version: a.DisplayVersion ?? undefined,
        installed: fmtDate(a.InstallDate),
      })),
      note: sortBy === "size" ? "Sizes are the installers' own estimates; games and dev tools dominate. Read-only — uninstalling is up to the user via Settings > Apps." : undefined,
    };
  }

  if (isMac) {
    try {
      const entries = await fs.readdir("/Applications");
      const apps = entries.filter((e) => e.endsWith(".app")).map((e) => e.replace(/\.app$/, ""));
      return { totalInstalled: apps.length, programs: apps.slice(0, limit).map((name) => ({ name })), note: "macOS: names only in this version." };
    } catch {
      return { error: "Could not list /Applications." };
    }
  }

  return { note: "Installed-software listing is Windows/macOS-only in this version." };
}
