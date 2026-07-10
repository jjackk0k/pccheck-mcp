#!/usr/bin/env node
// Build the one-click Claude Desktop extension: pccheck.mcpb
// Stages dist + production node_modules + manifest into bundle/, then packs it.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "bundle");
const out = path.join(root, "pccheck.mcpb");

const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

console.log("1/4 build TypeScript");
sh("npx tsc");

console.log("2/4 stage bundle/");
fs.rmSync(bundle, { recursive: true, force: true });
fs.rmSync(out, { force: true });
fs.mkdirSync(bundle, { recursive: true });
for (const f of ["manifest.json", "package.json", "package-lock.json", "README.md", "LICENSE", "icon.png"]) {
  fs.copyFileSync(path.join(root, f), path.join(bundle, f));
}
fs.cpSync(path.join(root, "dist"), path.join(bundle, "dist"), { recursive: true });

console.log("3/4 install production deps into bundle/");
sh("npm ci --omit=dev --no-audit --no-fund", bundle);

console.log("4/4 pack .mcpb");
sh(`npx --yes @anthropic-ai/mcpb pack "${bundle}" "${out}"`);

const sizeMB = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\nDone: ${out} (${sizeMB} MB)`);
