import { isWindows, run, round1 } from "./util.js";

export interface NvidiaGpu {
  name: string;
  driver: string | null;
  tempC: number | null;
  utilizationPercent: number | null;
  vramUsedMB: number | null;
  vramTotalMB: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
  fanPercent: number | null;
}

const FIELDS =
  "name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed";

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const v = parseFloat(s.trim());
  return Number.isFinite(v) ? v : null;
}

let cached: { at: number; value: NvidiaGpu[] | null } | null = null;

/** Query nvidia-smi for live GPU stats. Null when no NVIDIA GPU / driver. Cached for 2s. */
export async function nvidiaSmi(): Promise<NvidiaGpu[] | null> {
  if (cached && Date.now() - cached.at < 2000) return cached.value;

  const candidates = isWindows
    ? ["nvidia-smi", "C:\\Windows\\System32\\nvidia-smi.exe"]
    : ["nvidia-smi"];

  for (const bin of candidates) {
    const r = await run(bin, [`--query-gpu=${FIELDS}`, "--format=csv,noheader,nounits"], 8000);
    if (!r.ok || !r.out.trim()) continue;
    const gpus = r.out
      .trim()
      .split(/\r?\n/)
      .map((line): NvidiaGpu | null => {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 9) return null;
        return {
          name: parts[0],
          driver: parts[1] || null,
          tempC: num(parts[2]),
          utilizationPercent: num(parts[3]),
          vramUsedMB: round1(num(parts[4])),
          vramTotalMB: round1(num(parts[5])),
          powerDrawW: round1(num(parts[6])),
          powerLimitW: round1(num(parts[7])),
          fanPercent: num(parts[8]),
        };
      })
      .filter((g): g is NvidiaGpu => g !== null);
    if (gpus.length > 0) {
      cached = { at: Date.now(), value: gpus };
      return gpus;
    }
  }
  cached = { at: Date.now(), value: null };
  return null;
}
