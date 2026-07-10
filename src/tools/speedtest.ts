import { round1 } from "../util.js";

// Cloudflare's speed endpoint 403s large ?bytes= requests, so we loop moderate
// chunks until the time budget expires. Works for any connection speed.
const CHUNK_BYTES = 50_000_000;
const ENDPOINT = `https://speed.cloudflare.com/__down?bytes=${CHUNK_BYTES}`;

/**
 * Download-speed estimate against Cloudflare's public speed-test endpoint.
 * Downloads throwaway data only — nothing about the user is uploaded.
 */
export async function speedTest(args: { seconds?: number }) {
  const budgetS = Math.min(Math.max(args.seconds ?? 8, 3), 20);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetS * 1000);
  const start = performance.now();
  let firstByteMs: number | null = null;
  let bytes = 0;
  let httpError: number | null = null;
  let failure: string | null = null;

  try {
    while (performance.now() - start < budgetS * 1000) {
      const res = await fetch(ENDPOINT, { signal: controller.signal });
      if (!res.ok || !res.body) {
        httpError = res.status;
        break;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstByteMs == null) firstByteMs = performance.now() - start;
        bytes += value.byteLength;
      }
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      failure = e instanceof Error ? e.message : String(e);
    }
    // aborted = time budget hit while data was flowing; that's the normal path
  } finally {
    clearTimeout(timer);
  }

  const elapsedS = (performance.now() - start) / 1000;
  // Measure throughput from first byte so connection setup doesn't drag the average
  const effectiveS = firstByteMs != null ? elapsedS - firstByteMs / 1000 : elapsedS;

  if (bytes === 0) {
    if (httpError != null) {
      return { error: `Speed test endpoint unreachable (HTTP ${httpError}). Offline, captive portal, or strict firewall?` };
    }
    return { error: `Speed test failed: ${failure ?? "no data received"}` };
  }
  if (bytes < 1_000_000 || effectiveS <= 0.5) {
    return {
      downloadedMB: round1(bytes / 1e6),
      seconds: round1(elapsedS),
      error: "Too little data transferred to estimate speed — the connection is either very slow or blocking the test.",
    };
  }

  return {
    downloadMbps: Math.round((bytes * 8) / effectiveS / 1e6),
    downloadedMB: Math.round(bytes / 1e6),
    testSeconds: round1(elapsedS),
    timeToFirstByteMs: firstByteMs != null ? Math.round(firstByteMs) : undefined,
    note: "Single-connection test against Cloudflare — multi-connection tools (speedtest.net) can read 10-40% higher. Compare with what the user pays their ISP for.",
  };
}
