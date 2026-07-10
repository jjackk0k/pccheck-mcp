import si from "systeminformation";
import { gb, round1 } from "../util.js";

export async function systemOverview() {
  const [osInfo, system, cpu, mem, graphics, fsSize, baseboard] = await Promise.all([
    si.osInfo(),
    si.system(),
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.fsSize(),
    si.baseboard(),
  ]);
  const uptimeSec = si.time().uptime ?? 0;
  const uptimeHours = round1(uptimeSec / 3600) ?? 0;

  const drives = fsSize
    .filter((f) => f.size > 2 * 1024 ** 3)
    .map((f) => {
      const freeGB = gb(f.available);
      const usedPercent = round1(f.use);
      return {
        mount: f.mount || f.fs,
        type: f.type,
        sizeGB: gb(f.size),
        freeGB,
        usedPercent,
        warning:
          freeGB != null && usedPercent != null && (freeGB < 15 || usedPercent > 92)
            ? "LOW FREE SPACE — this alone can make a PC feel slow"
            : undefined,
      };
    });

  return {
    os: {
      name: osInfo.distro,
      version: osInfo.release,
      build: osInfo.build || undefined,
      arch: osInfo.arch,
      hostname: osInfo.hostname,
    },
    machine: {
      manufacturer: system.manufacturer || undefined,
      model: system.model || undefined,
      motherboard: [baseboard.manufacturer, baseboard.model].filter(Boolean).join(" ") || undefined,
      virtual: system.virtual || undefined,
    },
    cpu: {
      model: [cpu.manufacturer, cpu.brand].filter(Boolean).join(" "),
      physicalCores: cpu.physicalCores,
      threads: cpu.cores,
      baseGHz: cpu.speed,
      maxGHz: cpu.speedMax || undefined,
    },
    ram: {
      totalGB: gb(mem.total),
      usedGB: gb(mem.active),
      usedPercent: round1((mem.active / mem.total) * 100),
    },
    gpus: graphics.controllers.map((g) => ({
      model: g.model,
      vendor: g.vendor || undefined,
      vramGB: g.vram ? round1(g.vram / 1024) : null,
    })),
    displays: graphics.displays.map((d) => ({
      resolution: `${d.resolutionX}x${d.resolutionY}`,
      refreshHz: d.currentRefreshRate ?? undefined,
      main: d.main || undefined,
    })),
    drives,
    uptimeHours,
    uptimeNote:
      uptimeHours > 168
        ? "No reboot in over a week — a restart is the first fix for many slowdowns"
        : undefined,
  };
}

export async function batteryHealth() {
  const b = await si.battery();
  if (!b.hasBattery) {
    return {
      hasBattery: false,
      note: "No battery detected — this is a desktop PC (or the battery is not reporting).",
    };
  }
  const healthPercent =
    b.designedCapacity && b.maxCapacity && b.designedCapacity > 0
      ? round1((b.maxCapacity / b.designedCapacity) * 100)
      : null;
  return {
    hasBattery: true,
    percent: b.percent,
    isCharging: b.isCharging,
    acConnected: b.acConnected,
    healthPercent,
    healthNote:
      healthPercent != null && healthPercent < 70
        ? "Battery has degraded significantly — replacement may be worthwhile"
        : undefined,
    cycleCount: b.cycleCount || undefined,
    timeRemainingMinutes: b.timeRemaining ?? undefined,
    model: b.model || undefined,
  };
}
