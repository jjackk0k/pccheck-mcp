import si from "systeminformation";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { asArray, gb, isWindows, psJson, round1 } from "../util.js";

interface PsPhysicalDisk {
  FriendlyName: string;
  MediaType: string;
  BusType: string;
  HealthStatus: string;
  SizeGB: number;
}

export async function diskSpace() {
  const [fsSize, layout, psDisks] = await Promise.all([
    si.fsSize(),
    si.diskLayout(),
    psJson<PsPhysicalDisk | PsPhysicalDisk[]>(
      "Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, HealthStatus, @{n='SizeGB';e={[math]::Round($_.Size/1GB)}} | ConvertTo-Json",
      12_000,
    ),
  ]);

  const volumes = fsSize
    .filter((f) => f.size > 1024 ** 3)
    .map((f) => ({
      mount: f.mount || f.fs,
      type: f.type,
      sizeGB: gb(f.size),
      usedGB: gb(f.used),
      freeGB: gb(f.available),
      usedPercent: round1(f.use),
      warning: (gb(f.available) ?? 999) < 15 ? "LOW FREE SPACE" : undefined,
    }));

  const windows = asArray(psDisks).map((d) => ({
    name: d.FriendlyName,
    type: d.MediaType,
    bus: d.BusType,
    health: d.HealthStatus,
    sizeGB: d.SizeGB,
  }));

  const physicalDisks = windows.length
    ? windows
    : layout.map((d) => ({
        name: d.name,
        type: d.type,
        bus: d.interfaceType || undefined,
        health: d.smartStatus,
        sizeGB: gb(d.size),
      }));

  return {
    volumes,
    physicalDisks,
    hddNote: physicalDisks.some((d) => /hdd|^hd$/i.test(String(d.type)))
      ? "A mechanical hard drive is present — if Windows/apps live on it, an SSD upgrade is the single biggest speed fix"
      : undefined,
  };
}

interface ScanArgs {
  path?: string;
  top?: number;
  time_budget_seconds?: number;
}

/** Walk a folder tree, attributing sizes to the top-level children of root. Time-boxed. */
export async function scanFolderSizes(args: ScanArgs) {
  const root = path.resolve(args.path?.trim() || os.homedir());
  const top = Math.min(Math.max(args.top ?? 12, 3), 30);
  const budgetMs = Math.min(Math.max(args.time_budget_seconds ?? 15, 3), 60) * 1000;
  const deadline = Date.now() + budgetMs;

  let rootStat;
  try {
    rootStat = await fs.stat(root);
  } catch {
    return { error: `Cannot access path: ${root}` };
  }
  if (!rootStat.isDirectory()) return { error: `Not a folder: ${root}` };

  const childSizes = new Map<string, number>();
  const largestFiles: { path: string; sizeMB: number }[] = [];
  let fileCount = 0;
  let errorCount = 0;
  let truncated = false;

  const FILE_TOP = 15;
  const pushFile = (p: string, size: number) => {
    const sizeMB = size / 1024 ** 2;
    if (largestFiles.length < FILE_TOP) {
      largestFiles.push({ path: p, sizeMB });
      largestFiles.sort((a, b) => a.sizeMB - b.sizeMB);
    } else if (sizeMB > largestFiles[0].sizeMB) {
      largestFiles[0] = { path: p, sizeMB };
      largestFiles.sort((a, b) => a.sizeMB - b.sizeMB);
    }
  };

  // Simple concurrency-limited walker
  const MAX_CONCURRENT = 16;
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((res) => {
      if (active < MAX_CONCURRENT) {
        active++;
        res();
      } else {
        queue.push(() => {
          active++;
          res();
        });
      }
    });
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  async function walk(dir: string, bucket: string): Promise<void> {
    if (Date.now() > deadline) {
      truncated = true;
      return;
    }
    await acquire();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      errorCount++;
      release();
      return;
    }
    release();

    const subdirs: string[] = [];
    for (const e of entries) {
      if (Date.now() > deadline) {
        truncated = true;
        break;
      }
      const full = path.join(dir, e.name);
      try {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          subdirs.push(full);
        } else if (e.isFile()) {
          const st = await fs.stat(full);
          fileCount++;
          childSizes.set(bucket, (childSizes.get(bucket) ?? 0) + st.size);
          pushFile(full, st.size);
        }
      } catch {
        errorCount++;
      }
    }
    await Promise.all(subdirs.map((d) => walk(d, bucket)));
  }

  // Top-level children of root become the buckets
  let rootEntries;
  try {
    rootEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (e) {
    return { error: `Cannot list folder: ${root} (${e instanceof Error ? e.message : e})` };
  }

  const jobs: Promise<void>[] = [];
  for (const e of rootEntries) {
    const full = path.join(root, e.name);
    try {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        childSizes.set(e.name, childSizes.get(e.name) ?? 0);
        jobs.push(walk(full, e.name));
      } else if (e.isFile()) {
        const st = await fs.stat(full);
        fileCount++;
        childSizes.set("(files directly in this folder)", (childSizes.get("(files directly in this folder)") ?? 0) + st.size);
        pushFile(full, st.size);
      }
    } catch {
      errorCount++;
    }
  }
  await Promise.all(jobs);

  const folders = [...childSizes.entries()]
    .map(([name, size]) => ({ folder: name, sizeGB: round1(size / 1024 ** 3) ?? 0, sizeMB: Math.round(size / 1024 ** 2) }))
    .sort((a, b) => b.sizeMB - a.sizeMB)
    .slice(0, top)
    .map((f) => ({ folder: f.folder, sizeGB: f.sizeGB >= 0.1 ? f.sizeGB : undefined, sizeMB: f.sizeGB < 0.1 ? f.sizeMB : undefined }));

  return {
    scannedPath: root,
    folders,
    largestFiles: largestFiles
      .sort((a, b) => b.sizeMB - a.sizeMB)
      .map((f) => ({ path: f.path, sizeMB: Math.round(f.sizeMB), sizeGB: f.sizeMB >= 1024 ? round1(f.sizeMB / 1024) : undefined })),
    filesScanned: fileCount,
    complete: !truncated,
    note: truncated
      ? `Scan hit the ${budgetMs / 1000}s time budget — sizes are lower bounds. Re-run with a longer time_budget_seconds or a deeper path for exact numbers.`
      : undefined,
    accessErrorsSkipped: errorCount || undefined,
  };
}
