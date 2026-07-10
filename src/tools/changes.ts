import si from "systeminformation";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gb, round1 } from "../util.js";
import { listInstalledApps } from "./software.js";
import { startupPrograms } from "./startup.js";

const SNAP_DIR = path.join(os.homedir(), ".pccheck");
const SNAP_PATH = path.join(SNAP_DIR, "snapshot.json");

interface Snapshot {
  takenAt: string;
  osBuild: string | null;
  ramTotalGB: number | null;
  volumes: { mount: string; freeGB: number | null }[];
  gpus: { model: string; driver: string | null }[];
  startupEnabled: string[];
  apps: { name: string; version: string | null }[];
  processCount: number | null;
}

async function gatherSnapshot(): Promise<Snapshot> {
  const [osInfo, mem, fsSize, graphics, apps, startup, procs] = await Promise.all([
    si.osInfo(),
    si.mem(),
    si.fsSize(),
    si.graphics(),
    listInstalledApps(),
    startupPrograms().catch(() => null),
    si.processes().catch(() => null),
  ]);

  const startupEnabled =
    startup && "items" in startup && Array.isArray(startup.items)
      ? (startup.items as { name: string; enabled?: boolean }[])
          .filter((i) => i.enabled !== false)
          .map((i) => i.name)
      : [];

  return {
    takenAt: new Date().toISOString(),
    osBuild: osInfo.build || osInfo.release || null,
    ramTotalGB: gb(mem.total),
    volumes: fsSize
      .filter((f) => f.size > 1024 ** 3)
      .map((f) => ({ mount: f.mount || f.fs, freeGB: gb(f.available) })),
    gpus: graphics.controllers.map((g) => ({ model: g.model, driver: g.driverVersion || null })),
    startupEnabled,
    apps,
    processCount: procs?.all ?? null,
  };
}

function capList<T>(arr: T[], cap = 20): { items: T[]; more?: number } {
  return arr.length > cap ? { items: arr.slice(0, cap), more: arr.length - cap } : { items: arr };
}

/**
 * Diff the PC's state against the previous run and roll the baseline forward.
 * The snapshot file in ~/.pccheck is the ONLY thing PCCheck ever writes.
 */
export async function whatChanged() {
  const current = await gatherSnapshot();

  let prev: Snapshot | null = null;
  try {
    prev = JSON.parse(await fs.readFile(SNAP_PATH, "utf8")) as Snapshot;
    if (!prev || typeof prev.takenAt !== "string" || !Array.isArray(prev.apps)) prev = null;
  } catch {
    prev = null;
  }

  await fs.mkdir(SNAP_DIR, { recursive: true });
  await fs.writeFile(SNAP_PATH, JSON.stringify(current));

  if (!prev) {
    return {
      baselineSaved: true,
      note: "First run — baseline snapshot saved. Run this tool again later (days or weeks) and it will report exactly what changed in between.",
      snapshotFile: SNAP_PATH,
    };
  }

  const daysSince = round1((Date.now() - Date.parse(prev.takenAt)) / 86_400_000) ?? 0;

  // Disk
  const diskChanges: string[] = [];
  for (const vol of current.volumes) {
    const before = prev.volumes.find((v) => v.mount === vol.mount);
    if (!before || before.freeGB == null || vol.freeGB == null) continue;
    const delta = round1(vol.freeGB - before.freeGB) ?? 0;
    if (Math.abs(delta) >= 1) {
      diskChanges.push(
        `${vol.mount} ${delta < 0 ? "lost" : "gained"} ${Math.abs(delta)}GB free (${before.freeGB}GB → ${vol.freeGB}GB)`,
      );
    }
  }

  // Programs
  const prevApps = new Map(prev.apps.map((a) => [a.name, a.version]));
  const curApps = new Map(current.apps.map((a) => [a.name, a.version]));
  const installed = [...curApps.keys()].filter((n) => !prevApps.has(n));
  const removed = [...prevApps.keys()].filter((n) => !curApps.has(n));
  const updated = [...curApps.entries()]
    .filter(([n, v]) => prevApps.has(n) && prevApps.get(n) !== v && v != null && prevApps.get(n) != null)
    .map(([n, v]) => `${n} (${prevApps.get(n)} → ${v})`);

  // Startup
  const prevStartup = new Set(prev.startupEnabled);
  const curStartup = new Set(current.startupEnabled);
  const startupAdded = [...curStartup].filter((n) => !prevStartup.has(n));
  const startupRemoved = [...prevStartup].filter((n) => !curStartup.has(n));

  // Drivers / OS
  const driverChanges = current.gpus
    .map((g) => {
      const before = prev!.gpus.find((p) => p.model === g.model);
      return before && before.driver !== g.driver && g.driver
        ? `${g.model}: driver ${before.driver ?? "?"} → ${g.driver}`
        : null;
    })
    .filter((x): x is string => x != null);
  const osChanged = prev.osBuild !== current.osBuild && current.osBuild != null;

  // Headline hints
  const hints: string[] = [];
  const bigLoss = diskChanges.find((c) => /lost (\d+(?:\.\d+)?)GB/.test(c) && parseFloat(/lost (\d+(?:\.\d+)?)GB/.exec(c)![1]) >= 5);
  if (bigLoss) hints.push(`Significant disk space disappeared: ${bigLoss}. scan_folder_sizes can find where it went.`);
  if (startupAdded.length) hints.push(`New programs now run at every boot: ${startupAdded.join(", ")} — a classic cause of "my PC got slower".`);
  if (installed.length >= 3) hints.push(`${installed.length} new programs were installed since the last check.`);
  if (osChanged) hints.push(`Windows was updated (build ${prev.osBuild} → ${current.osBuild}).`);
  if (hints.length === 0) hints.push("No significant changes detected since the last snapshot.");

  return {
    comparedTo: prev.takenAt.slice(0, 16).replace("T", " ") + " UTC",
    daysSince,
    headline: hints,
    disk: diskChanges.length ? diskChanges : "No meaningful free-space changes",
    programs: {
      installed: capList(installed),
      removed: capList(removed),
      updated: capList(updated, 12),
    },
    startupChanges: {
      nowRunAtBoot: startupAdded.length ? startupAdded : undefined,
      noLongerRunAtBoot: startupRemoved.length ? startupRemoved : undefined,
    },
    driverChanges: driverChanges.length ? driverChanges : undefined,
    baselineRolledForward: true,
  };
}
