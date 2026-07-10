#!/usr/bin/env node
// Generates icon.png (512x512) — heartbeat pulse on a monitor, teal on dark.
// Zero dependencies: draws into a raw RGBA buffer (2x supersampled) and writes PNG via node:zlib.
import { deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icon.png");
const S = 1024; // draw at 2x, output 512
const px = new Float64Array(S * S * 4);

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
  const i = (y * S + x) * 4;
  const na = a + px[i + 3] * (1 - a);
  if (na <= 0) return;
  px[i] = (r * a + px[i] * px[i + 3] * (1 - a)) / na;
  px[i + 1] = (g * a + px[i + 1] * px[i + 3] * (1 - a)) / na;
  px[i + 2] = (b * a + px[i + 2] * px[i + 3] * (1 - a)) / na;
  px[i + 3] = na;
}

function inRoundedRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + rad, Math.min(x, x1 - rad));
  const cy = Math.max(y0 + rad, Math.min(y, y1 - rad));
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}

// 1. Background: rounded square, vertical teal gradient
const R = 200;
for (let y = 0; y < S; y++) {
  const t = y / S;
  const r = 13 + (17 - 13) * t; // #0d9488 -> #115e59
  const g = 148 + (94 - 148) * t;
  const b = 136 + (89 - 136) * t;
  for (let x = 0; x < S; x++) {
    if (inRoundedRect(x, y, 0, 0, S - 1, S - 1, R)) blend(x, y, r, g, b, 1);
  }
}

// 2. Monitor outline: white rounded rect ring
function ring(x0, y0, x1, y1, rad, thick, r, g, b) {
  for (let y = Math.floor(y0 - 2); y <= y1 + 2; y++) {
    for (let x = Math.floor(x0 - 2); x <= x1 + 2; x++) {
      const outer = inRoundedRect(x, y, x0, y0, x1, y1, rad);
      const inner = inRoundedRect(x, y, x0 + thick, y0 + thick, x1 - thick, y1 - thick, Math.max(2, rad - thick));
      if (outer && !inner) blend(x, y, r, g, b, 1);
    }
  }
}
ring(176, 232, 848, 704, 56, 30, 255, 255, 255);

// 3. Monitor stand + base
for (let y = 704; y < 776; y++) for (let x = 472; x < 552; x++) blend(x, y, 255, 255, 255, 1);
for (let y = 776; y < 812; y++) for (let x = 352; x < 672; x++) {
  if (inRoundedRect(x, y, 352, 776, 671, 811, 16)) blend(x, y, 255, 255, 255, 1);
}

// 4. Heartbeat pulse across the screen (thick polyline, stamped discs)
const PTS = [
  [232, 468], [400, 468], [444, 404], [492, 560], [540, 316], [590, 596], [636, 468], [792, 468],
];
function disc(cx, cy, rad, r, g, b) {
  for (let y = Math.floor(cy - rad) - 1; y <= cy + rad + 1; y++)
    for (let x = Math.floor(cx - rad) - 1; x <= cx + rad + 1; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= rad) blend(x, y, r, g, b, 1);
      else if (d <= rad + 1.5) blend(x, y, r, g, b, rad + 1.5 - d);
    }
}
for (let i = 0; i < PTS.length - 1; i++) {
  const [ax, ay] = PTS[i];
  const [bx, by] = PTS[i + 1];
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(len / 2);
  for (let s = 0; s <= steps; s++) {
    disc(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps, 15, 255, 255, 255);
  }
}
disc(792, 468, 24, 255, 255, 255); // end dot

// 5. Downsample 2x -> 512 and encode PNG
const W = S / 2;
const raw = Buffer.alloc(W * W * 4);
for (let y = 0; y < W; y++)
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 4; c++) {
      const v =
        (px[((2 * y) * S + 2 * x) * 4 + c] +
          px[((2 * y) * S + 2 * x + 1) * 4 + c] +
          px[((2 * y + 1) * S + 2 * x) * 4 + c] +
          px[((2 * y + 1) * S + 2 * x + 1) * 4 + c]) / 4;
      raw[(y * W + x) * 4 + c] = Math.round(c === 3 ? v * 255 : v);
    }
  }

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(W, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const scanlines = Buffer.alloc(W * (W * 4 + 1));
for (let y = 0; y < W; y++) {
  scanlines[y * (W * 4 + 1)] = 0; // filter: none
  raw.copy(scanlines, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log(`icon.png written (${(png.length / 1024).toFixed(1)} KB)`);
