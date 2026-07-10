import si from "systeminformation";
import { gb, round1 } from "../util.js";
import { nvidiaSmi } from "../nvidia.js";

interface ProcRow {
  name: string;
  pid: number;
  cpuPercent: number | null;
  memPercent: number | null;
  memMB: number | null;
  path?: string;
  user?: string;
}

function procRow(p: si.Systeminformation.ProcessesProcessData, includePath = false): ProcRow {
  return {
    name: p.name,
    pid: p.pid,
    cpuPercent: round1(p.cpu),
    memPercent: round1(p.mem),
    // systeminformation reports memRss in KiB
    memMB: p.memRss ? Math.round(p.memRss / 1024) : null,
    path: includePath ? p.path || undefined : undefined,
    user: includePath ? p.user || undefined : undefined,
  };
}

export async function performanceSnapshot() {
  const [load, mem, procs, gpus] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.processes(),
    nvidiaSmi(),
  ]);

  const perCore = (load.cpus ?? []).map((c) => Math.round(c.load));
  const list = procs.list ?? [];
  const topByCpu = [...list]
    .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
    .slice(0, 10)
    .map((p) => procRow(p));
  const topByMemory = [...list]
    .sort((a, b) => (b.memRss ?? 0) - (a.memRss ?? 0))
    .slice(0, 10)
    .map((p) => procRow(p));

  const ramUsedPercent = round1((mem.active / mem.total) * 100);

  return {
    cpu: {
      overallPercent: Math.round(load.currentLoad),
      perCorePercent: perCore,
      busiestCorePercent: perCore.length ? Math.max(...perCore) : null,
      note:
        Math.round(load.currentLoad) < 30 && perCore.some((c) => c > 90)
          ? "Overall CPU is low but one core is maxed — a single-threaded bottleneck"
          : undefined,
    },
    ram: {
      totalGB: gb(mem.total),
      usedGB: gb(mem.active),
      usedPercent: ramUsedPercent,
      swapUsedGB: gb(mem.swapused),
      pressure:
        ramUsedPercent != null && ramUsedPercent > 90
          ? "RAM nearly full — likely causing slowdown via swapping"
          : undefined,
    },
    gpu: gpus?.map((g) => ({
      model: g.name,
      utilizationPercent: g.utilizationPercent,
      vramUsedMB: g.vramUsedMB,
      vramTotalMB: g.vramTotalMB,
      tempC: g.tempC,
    })),
    processes: {
      total: procs.all,
      topByCpu,
      topByMemory,
    },
  };
}

export async function topProcesses(args: { sort_by?: "cpu" | "memory"; limit?: number; filter?: string }) {
  const sortBy = args.sort_by ?? "cpu";
  const limit = Math.min(Math.max(args.limit ?? 15, 1), 50);
  const filter = args.filter?.toLowerCase();

  const procs = await si.processes();
  let list = procs.list ?? [];
  if (filter) {
    list = list.filter(
      (p) =>
        p.name?.toLowerCase().includes(filter) ||
        p.command?.toLowerCase().includes(filter) ||
        p.path?.toLowerCase().includes(filter),
    );
  }
  list = [...list].sort((a, b) =>
    sortBy === "cpu" ? (b.cpu ?? 0) - (a.cpu ?? 0) : (b.memRss ?? 0) - (a.memRss ?? 0),
  );

  return {
    totalProcesses: procs.all,
    matching: list.length,
    showing: Math.min(limit, list.length),
    sortedBy: sortBy,
    processes: list.slice(0, limit).map((p) => procRow(p, Boolean(filter))),
  };
}
