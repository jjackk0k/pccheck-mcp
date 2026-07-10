import si from "systeminformation";
import { isWindows, psJson, round1 } from "../util.js";
import { nvidiaSmi } from "../nvidia.js";

export async function gpuInfo() {
  const [graphics, nvidia] = await Promise.all([si.graphics(), nvidiaSmi()]);

  return {
    gpus: graphics.controllers.map((g) => ({
      model: g.model,
      vendor: g.vendor || undefined,
      vramGB: g.vram ? round1(g.vram / 1024) : null,
      bus: g.bus || undefined,
      driverVersion: g.driverVersion || undefined,
    })),
    liveStats: nvidia ?? undefined,
    liveStatsNote: nvidia
      ? undefined
      : "nvidia-smi not available — live utilization/temperature stats require an NVIDIA GPU with drivers installed",
    displays: graphics.displays.map((d) => ({
      model: d.model || undefined,
      resolution: `${d.resolutionX}x${d.resolutionY}`,
      refreshHz: d.currentRefreshRate ?? undefined,
      connection: d.connection || undefined,
      main: d.main || undefined,
    })),
    displayNote: graphics.displays.some(
      (d) => d.currentRefreshRate != null && d.currentRefreshRate <= 60 && (d.resolutionX ?? 0) >= 1920,
    )
      ? "A display is running at 60Hz — if the monitor supports more, raising the refresh rate is a free upgrade"
      : undefined,
  };
}

async function isElevated(): Promise<boolean | null> {
  if (isWindows) {
    return psJson<boolean>(
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | ConvertTo-Json",
      8000,
    );
  }
  return typeof process.getuid === "function" ? process.getuid() === 0 : null;
}

export async function temperatures() {
  const [cpuTemp, nvidia, battery, elevated] = await Promise.all([
    si.cpuTemperature(),
    nvidiaSmi(),
    si.battery(),
    isElevated(),
  ]);

  const cpuAvailable = cpuTemp.main != null && cpuTemp.main > 0;
  const cpu = cpuAvailable
    ? {
        mainC: round1(cpuTemp.main),
        maxC: round1(cpuTemp.max),
        perCoreC: cpuTemp.cores?.length ? cpuTemp.cores.map((c) => Math.round(c)) : undefined,
      }
    : {
        unavailable: true,
        reason: isWindows
          ? elevated
            ? "CPU sensors not exposed to Windows APIs on this machine. A free tool like LibreHardwareMonitor can read them."
            : "Windows usually blocks CPU temperature reads for non-administrator processes. GPU temperature below is still accurate."
          : "No CPU temperature sensor found on this platform.",
      };

  const gpu =
    nvidia?.map((g) => ({
      model: g.name,
      tempC: g.tempC,
      fanPercent: g.fanPercent,
      powerDrawW: g.powerDrawW,
    })) ?? undefined;

  return {
    cpu,
    gpu,
    gpuNote: gpu ? undefined : "No NVIDIA GPU stats — nvidia-smi not found.",
    battery:
      battery.hasBattery && battery.percent != null
        ? { percent: battery.percent, isCharging: battery.isCharging }
        : undefined,
    healthyRanges: {
      cpuIdleC: "30-55",
      cpuLoadC: "60-85 (sustained >90 = cooling problem)",
      gpuLoadC: "60-80 (sustained >85 = cooling problem)",
    },
  };
}
