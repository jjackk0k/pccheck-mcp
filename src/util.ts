import { spawn } from "node:child_process";

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

export interface RunResult {
  ok: boolean;
  out: string;
  err: string;
  timedOut: boolean;
}

/** Run an executable with args. Never rejects; kills the process on timeout. */
export function run(file: string, args: string[], timeoutMs = 10_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let settled = false;
    let timedOut = false;

    let child;
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ ok: false, out: "", err: String(e), timedOut: false });
      return;
    }

    const finish = (ok: boolean, errText?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, out, err: errText ?? err, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      if (out.length < 4_000_000) out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < 100_000) err += d.toString();
    });
    child.on("error", (e) => finish(false, String(e)));
    child.on("close", (code) => finish(code === 0 && !timedOut));
  });
}

/** Run a PowerShell script (Windows). UTF-8 output, no profile, non-interactive. */
export function runPS(script: string, timeoutMs = 15_000): Promise<RunResult> {
  const prelude =
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; ";
  return run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", prelude + script],
    timeoutMs,
  );
}

/** Run a PowerShell script that ends in ConvertTo-Json and parse the result. Null on any failure. */
export async function psJson<T = unknown>(script: string, timeoutMs = 15_000): Promise<T | null> {
  if (!isWindows) return null;
  const r = await runPS(script, timeoutMs);
  const trimmed = r.out.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

/** ConvertTo-Json emits a bare object for single results — normalize to array. */
export function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function gb(bytes: number | null | undefined, digits = 1): number | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  const f = 10 ** digits;
  return Math.round((bytes / GB) * f) / f;
}

export function mbFromBytes(bytes: number | null | undefined): number | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  return Math.round(bytes / MB);
}

export function round1(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/** Wrap data as an MCP text result. */
export function text(data: unknown): ToolResult {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 1);
  return { content: [{ type: "text", text: body }] };
}

export function errText(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

/** Wrap a tool handler so unexpected exceptions become a clean MCP error instead of a crash. */
export function safe<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return errText(`Tool failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}

/** Resolve to a fallback value if the promise takes longer than ms. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((res) => setTimeout(() => res(fallback), ms)),
  ]);
}
