import si from "systeminformation";
import { Resolver } from "node:dns/promises";
import { isWindows, psJson, round1, run, runPS, withTimeout } from "../util.js";

interface PingStats {
  host: string;
  sent: number;
  received: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
}

async function pingHost(host: string, label?: string): Promise<PingStats> {
  const base: PingStats = { host: label ?? host, sent: 4, received: 0, avgMs: null, minMs: null, maxMs: null };
  if (!/^[a-zA-Z0-9.:_-]+$/.test(host)) return base;

  if (isWindows) {
    const script = `$r = @(Test-Connection -ComputerName '${host}' -Count 4 -ErrorAction SilentlyContinue); if ($r.Count -gt 0) { $m = $r | Measure-Object -Property ResponseTime -Average -Minimum -Maximum; @{ received = $r.Count; avgMs = [math]::Round($m.Average,1); minMs = $m.Minimum; maxMs = $m.Maximum } | ConvertTo-Json -Compress } else { @{ received = 0 } | ConvertTo-Json -Compress }`;
    const res = await psJson<{ received: number; avgMs?: number; minMs?: number; maxMs?: number }>(script, 25_000);
    if (!res) return base;
    return { ...base, received: res.received ?? 0, avgMs: res.avgMs ?? null, minMs: res.minMs ?? null, maxMs: res.maxMs ?? null };
  }

  const r = await run("ping", ["-c", "4", host], 15_000);
  const received = Number(/(\d+)\s+(?:packets\s+)?received/.exec(r.out)?.[1] ?? 0);
  const rtt = /=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/.exec(r.out);
  return {
    ...base,
    received,
    minMs: rtt ? round1(parseFloat(rtt[1])) : null,
    avgMs: rtt ? round1(parseFloat(rtt[2])) : null,
    maxMs: rtt ? round1(parseFloat(rtt[3])) : null,
  };
}

async function dnsTiming(): Promise<{ ok: boolean; ms: number | null }> {
  try {
    const resolver = new Resolver();
    const start = process.hrtime.bigint();
    const ok = await withTimeout(
      resolver.resolve4("cloudflare.com").then(() => true),
      5000,
      false,
    );
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return ok ? { ok: true, ms: round1(ms) } : { ok: false, ms: null };
  } catch {
    return { ok: false, ms: null };
  }
}

async function wifiInfo() {
  const conns = await withTimeout(si.wifiConnections(), 8000, [] as si.Systeminformation.WifiConnectionData[]);
  if (conns.length > 0) {
    const c = conns[0];
    return {
      ssid: c.ssid,
      signalQualityPercent: c.quality ?? undefined,
      channel: c.channel || undefined,
      frequencyMHz: c.frequency || undefined,
      txRateMbps: c.txRate || undefined,
    };
  }
  if (isWindows) {
    const r = await runPS("netsh wlan show interfaces", 8000);
    const out = r.out.trim();
    if (out && /:/.test(out) && !/no wireless interface/i.test(out)) {
      return { raw: out.slice(0, 700), note: "Raw wifi adapter status (interpret the fields above)" };
    }
  }
  return null;
}

export async function networkCheck() {
  // Measured in isolation: the si/wifi calls below spawn PowerShell and block the
  // event loop, inflating a concurrent DNS timing from ~10ms to ~190ms.
  const dns = await dnsTiming();
  const [ifaces, gateway, wifi] = await Promise.all([
    withTimeout(si.networkInterfaces() as Promise<si.Systeminformation.NetworkInterfacesData[]>, 8000, []),
    withTimeout(si.networkGatewayDefault(), 8000, ""),
    wifiInfo(),
  ]);

  const active = (Array.isArray(ifaces) ? ifaces : [ifaces])
    .filter((i) => i && i.operstate === "up" && !i.internal && (i.ip4 || i.ip6))
    .map((i) => ({
      name: i.ifaceName || i.iface,
      type: i.type || undefined,
      ip4: i.ip4 || undefined,
      linkSpeedMbps: i.speed ?? undefined,
      isDefault: i.default || undefined,
    }));

  const pings: Promise<PingStats>[] = [pingHost("1.1.1.1", "internet (Cloudflare 1.1.1.1)"), pingHost("8.8.8.8", "internet (Google 8.8.8.8)")];
  if (gateway) pings.unshift(pingHost(gateway, `your router (${gateway})`));
  const pingResults = await Promise.all(pings);

  const router = gateway ? pingResults[0] : null;
  const internet = pingResults.filter((p) => p.host.startsWith("internet"));
  const bestInternet = internet.reduce<PingStats | null>(
    (best, p) => (p.received > 0 && (best == null || (p.avgMs ?? 1e9) < (best.avgMs ?? 1e9)) ? p : best),
    null,
  );
  const defaultIface = active.find((a) => a.isDefault);
  const onWifi = defaultIface
    ? defaultIface.type === "wireless"
    : wifi != null && !("raw" in (wifi as object));

  const hints: string[] = [];
  if (router && router.received === 0 && bestInternet == null) {
    hints.push("Your PC cannot reach your own router and the internet is unreachable — the problem is local: wifi connection, cable, or network adapter.");
  } else if (bestInternet == null) {
    hints.push(router && router.received > 0 ? "Router responds but the internet does not — modem or ISP problem. Power-cycling modem and router is the standard first fix." : "No internet reachability detected.");
  } else {
    if (router && router.received === 0) {
      hints.push("Your router doesn't answer pings (many routers block this — usually not a fault). The internet is reachable, so the connection itself works.");
    }
    if (router?.avgMs != null && router.avgMs > 30 && onWifi) {
      hints.push(`Latency to your own router is high (${router.avgMs}ms) — weak wifi signal or interference. Moving closer or using 5GHz usually fixes this.`);
    }
    if ((bestInternet.avgMs ?? 0) > 120) hints.push(`Internet latency is high (${bestInternet.avgMs}ms average).`);
    if (internet.some((p) => p.received > 0 && p.received < p.sent)) hints.push("Packet loss detected — often wifi interference or an ISP line issue.");
    if (!dns.ok) hints.push("DNS lookups are failing — websites won't load by name even though the internet is reachable. Changing DNS to 1.1.1.1 typically fixes this.");
    if (dns.ok && (dns.ms ?? 0) > 200) hints.push(`DNS lookups are slow (${dns.ms}ms).`);
    if (hints.length === 0) hints.push("Connection looks healthy: router and internet reachable with good latency.");
  }

  return {
    activeInterfaces: active,
    wifi: wifi ?? undefined,
    pings: pingResults.map((p) => ({
      target: p.host,
      received: `${p.received}/${p.sent}`,
      avgMs: p.avgMs ?? undefined,
      maxMs: p.maxMs ?? undefined,
      unreachable: p.received === 0 || undefined,
    })),
    dnsLookup: dns.ok ? { ok: true, ms: dns.ms } : { ok: false, note: "DNS resolution failed" },
    diagnosis: hints,
  };
}
