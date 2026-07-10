import si from "systeminformation";
import { asArray, isWindows, psJson, round1 } from "../util.js";

interface WinEvent {
  time: string;
  Id: number;
  source: string;
  message: string;
}

const EVENT_MEANING: Record<number, string> = {
  41: "Unexpected shutdown — power loss or hard crash",
  1001: "Blue screen (bugcheck) recorded",
  6008: "Unexpected shutdown",
  1000: "Application crash",
};

const SYSTEM_CRASH_SCRIPT = `
$ev = Get-WinEvent -FilterHashtable @{ LogName='System'; Id=@(41,1001,6008); StartTime=(Get-Date).AddDays(-30) } -MaxEvents 12 -ErrorAction SilentlyContinue
if ($ev) { $ev | Select-Object @{n='time';e={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm')}}, Id, @{n='source';e={$_.ProviderName}}, @{n='message';e={ if ($_.Message) { ($_.Message.Substring(0, [Math]::Min(200, $_.Message.Length)) -replace '\\s+', ' ') } else { '' } }} | ConvertTo-Json } else { '[]' }
`.trim();

const APP_CRASH_SCRIPT = `
$ev = Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='Application Error'; Id=1000; StartTime=(Get-Date).AddDays(-14) } -MaxEvents 10 -ErrorAction SilentlyContinue
if ($ev) { $ev | Select-Object @{n='time';e={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm')}}, Id, @{n='source';e={$_.ProviderName}}, @{n='message';e={ if ($_.Message) { ($_.Message.Substring(0, [Math]::Min(160, $_.Message.Length)) -replace '\\s+', ' ') } else { '' } }} | ConvertTo-Json } else { '[]' }
`.trim();

const DEFENDER_SCRIPT = `
try { Get-MpComputerStatus -ErrorAction Stop | Select-Object AMServiceEnabled, RealTimeProtectionEnabled, AntivirusEnabled, @{n='SignatureAgeDays';e={$_.AntivirusSignatureAge}}, @{n='DaysSinceQuickScan';e={$_.QuickScanAge}} | ConvertTo-Json } catch { 'null' }
`.trim();

const PENDING_REBOOT_SCRIPT = `
@{ windowsUpdate = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'); servicing = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') } | ConvertTo-Json
`.trim();

const DISK_HEALTH_SCRIPT = `
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus | ConvertTo-Json
`.trim();

function mapEvents(raw: WinEvent | WinEvent[] | null) {
  return asArray(raw).map((e) => ({
    time: e.time,
    meaning: EVENT_MEANING[e.Id] ?? `Event ${e.Id}`,
    detail: e.message?.slice(0, 200) || undefined,
  }));
}

export async function crashAndHealthReport() {
  const uptimeSec = si.time().uptime ?? 0;
  const bootTime = new Date(Date.now() - uptimeSec * 1000);
  const base = {
    uptimeHours: round1(uptimeSec / 3600),
    lastBoot: bootTime.toISOString().slice(0, 16).replace("T", " ") + " UTC",
  };

  if (!isWindows) {
    const layout = await si.diskLayout();
    return {
      ...base,
      diskHealth: layout.map((d) => ({ name: d.name, smartStatus: d.smartStatus })),
      note: "Crash log, antivirus, and pending-update checks are Windows-only in this version.",
    };
  }

  const [systemCrashes, appCrashes, defender, pendingReboot, diskHealth, osInfo] = await Promise.all([
    psJson<WinEvent[]>(SYSTEM_CRASH_SCRIPT, 25_000),
    psJson<WinEvent[]>(APP_CRASH_SCRIPT, 25_000),
    psJson<{
      AMServiceEnabled: boolean;
      RealTimeProtectionEnabled: boolean;
      AntivirusEnabled: boolean;
      SignatureAgeDays: number;
      DaysSinceQuickScan: number;
    }>(DEFENDER_SCRIPT, 20_000),
    psJson<{ windowsUpdate: boolean; servicing: boolean }>(PENDING_REBOOT_SCRIPT, 12_000),
    psJson<{ FriendlyName: string; MediaType: string; HealthStatus: string }[]>(DISK_HEALTH_SCRIPT, 12_000),
    si.osInfo(),
  ]);

  const sys = mapEvents(systemCrashes);
  const apps = mapEvents(appCrashes);
  const disks = asArray(diskHealth);
  const unhealthyDisk = disks.find((d) => d.HealthStatus && d.HealthStatus !== "Healthy");

  return {
    ...base,
    windowsVersion: `${osInfo.distro} (build ${osInfo.build})`,
    systemCrashesLast30Days: sys.length ? sys : "None — no unexpected shutdowns or blue screens recorded",
    appCrashesLast14Days: apps.length ? apps : "None recorded",
    antivirus: defender
      ? {
          defenderActive: defender.AMServiceEnabled && defender.RealTimeProtectionEnabled,
          signatureAgeDays: defender.SignatureAgeDays,
          daysSinceQuickScan: defender.DaysSinceQuickScan,
          warning:
            defender.SignatureAgeDays > 7
              ? "Antivirus definitions are stale — Windows Update may be stuck"
              : undefined,
        }
      : "Defender status unavailable (a third-party antivirus may be managing protection)",
    pendingReboot: pendingReboot
      ? {
          required: pendingReboot.windowsUpdate || pendingReboot.servicing,
          reason: pendingReboot.windowsUpdate
            ? "Windows Update is waiting for a restart"
            : pendingReboot.servicing
              ? "System servicing is waiting for a restart"
              : undefined,
        }
      : undefined,
    diskHealth: disks.map((d) => ({ name: d.FriendlyName, type: d.MediaType, status: d.HealthStatus })),
    diskWarning: unhealthyDisk
      ? `Disk "${unhealthyDisk.FriendlyName}" reports ${unhealthyDisk.HealthStatus} — BACK UP DATA NOW and plan a replacement`
      : undefined,
  };
}
