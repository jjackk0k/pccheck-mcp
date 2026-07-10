import { withTimeout } from "../util.js";
import { systemOverview, batteryHealth } from "./overview.js";
import { performanceSnapshot } from "./performance.js";
import { temperatures } from "./gpu.js";
import { diskSpace } from "./disks.js";
import { crashAndHealthReport } from "./health.js";
import { startupPrograms } from "./startup.js";
import { networkCheck } from "./network.js";

const UNAVAILABLE = { unavailable: "This section timed out or failed — call its dedicated tool for details." };

function section<T>(p: Promise<T>, ms: number): Promise<T | typeof UNAVAILABLE> {
  return withTimeout<T | typeof UNAVAILABLE>(p, ms, UNAVAILABLE);
}

/** One-call full PC checkup. Every section runs concurrently and is individually time-boxed. */
export async function fullCheckup() {
  const [overview, performance, temps, disks, health, startup, network, battery] = await Promise.all([
    section(systemOverview(), 20_000),
    section(performanceSnapshot(), 20_000),
    section(temperatures(), 15_000),
    section(diskSpace(), 15_000),
    section(crashAndHealthReport(), 30_000),
    section(startupPrograms(), 22_000),
    section(networkCheck(), 30_000),
    section(batteryHealth(), 8_000),
  ]);

  const batteryRelevant = battery && "hasBattery" in battery && battery.hasBattery;

  return {
    checkup: {
      hardware: overview,
      livePerformance: performance,
      temperatures: temps,
      storage: disks,
      stabilityAndSecurity: health,
      startupPrograms: startup,
      network: network,
      battery: batteryRelevant ? battery : undefined,
    },
    howToPresent:
      "Give the user a clear verdict first (healthy / specific problems found), then the evidence. Translate numbers into plain language. Call out anything in a 'warning', 'diagnosis', or 'note' field. All checks were read-only.",
  };
}
