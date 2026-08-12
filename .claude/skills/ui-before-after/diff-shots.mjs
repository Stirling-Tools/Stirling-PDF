// Auto-diff before/ vs after/ screenshots, classify each as
// unchanged | changed | added | removed, and CROP each changed pair to the
// affected region (bounding box of differing pixels + padding) - unless the
// change spans most of the page, in which case the full frame is kept.
// Run from frontend/editor (so deps resolve):
//   node <skill>/diff-shots.mjs <beforeDir> <afterDir> [outDir]
// Env:
//   DIFF_THRESHOLD  min fraction of differing pixels to count as changed (default 0.001)
//   DIFF_PAD        padding px around the affected region (default 24)
//   DIFF_PAGEWIDE   if affected bbox area / image area exceeds this, keep full frame (default 0.6)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const pm = require("pixelmatch");
const pixelmatch = pm.default || pm;
const { PNG } = require("pngjs");

const beforeDir = path.resolve(process.argv[2]);
const afterDir = path.resolve(process.argv[3]);
const outDir = path.resolve(process.argv[4] || afterDir);
const THRESHOLD = Number(process.env.DIFF_THRESHOLD ?? "0.001");
const PAD = Number(process.env.DIFF_PAD ?? "24");
const PAGEWIDE = Number(process.env.DIFF_PAGEWIDE ?? "0.6");

const read = (p) => PNG.sync.read(fs.readFileSync(p));
const isShot = (f) => f.endsWith(".png") && !/__(diff|before_crop|after_crop)\.png$/.test(f);
const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter(isShot) : []);
const names = [...new Set([...list(beforeDir), ...list(afterDir)])].sort();
fs.mkdirSync(outDir, { recursive: true });

function cropPNG(src, x, y, w, h) {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, x, y, w, h, 0, 0);
  return out;
}
const writePNG = (p, png) => fs.writeFileSync(p, PNG.sync.write(png));

// Bounding box of differing pixels using a diff mask (alpha>0 where changed).
function changedBBox(before, after, w, h) {
  const mask = new PNG({ width: w, height: h });
  pixelmatch(before.data, after.data, mask.data, w, h, { threshold: 0.1, diffMask: true });
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask.data[(y * w + x) * 4 + 3] > 0) {
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, count };
}

const report = [];
for (const name of names) {
  const id = name.replace(/\.png$/, "");
  const bp = path.join(beforeDir, name), ap = path.join(afterDir, name);
  const hasB = fs.existsSync(bp), hasA = fs.existsSync(ap);
  if (hasB && !hasA) { report.push({ id, status: "removed", before: bp }); continue; }
  if (!hasB && hasA) { report.push({ id, status: "added", after: ap }); continue; }

  const before = read(bp), after = read(ap);
  if (before.width !== after.width || before.height !== after.height) {
    report.push({ id, status: "changed", note: "dimensions differ", before: bp, after: ap });
    continue;
  }
  const w = after.width, h = after.height;
  const overlay = new PNG({ width: w, height: h });
  const px = pixelmatch(before.data, after.data, overlay.data, w, h, { threshold: 0.1 });
  const ratio = px / (w * h);
  if (ratio <= THRESHOLD) { report.push({ id, status: "unchanged", ratio: Number(ratio.toFixed(5)), before: bp, after: ap }); continue; }

  const box = changedBBox(before, after, w, h);
  // Pad + clamp the affected region.
  const x = Math.max(0, box.minX - PAD), y = Math.max(0, box.minY - PAD);
  const x2 = Math.min(w, box.maxX + 1 + PAD), y2 = Math.min(h, box.maxY + 1 + PAD);
  const bw = x2 - x, bh = y2 - y;
  const pageWide = (bw * bh) / (w * h) > PAGEWIDE;

  const entry = { id, status: "changed", ratio: Number(ratio.toFixed(5)), before: bp, after: ap, pageWide };
  if (pageWide) {
    // Change spans most of the page - keep the full frame, full overlay.
    const dp = path.join(outDir, `${id}__diff.png`); writePNG(dp, overlay);
    entry.diff = dp;
  } else {
    entry.bbox = { x, y, w: bw, h: bh };
    const cb = path.join(outDir, `${id}__before_crop.png`); writePNG(cb, cropPNG(before, x, y, bw, bh));
    const ca = path.join(outDir, `${id}__after_crop.png`); writePNG(ca, cropPNG(after, x, y, bw, bh));
    const dp = path.join(outDir, `${id}__diff.png`); writePNG(dp, cropPNG(overlay, x, y, bw, bh));
    entry.cropBefore = cb; entry.cropAfter = ca; entry.diff = dp;
  }
  report.push(entry);
}

fs.writeFileSync(path.join(outDir, "diff-report.json"), JSON.stringify(report, null, 2));
const changed = report.filter((r) => r.status !== "unchanged");
console.log(`diffed ${report.length} view(s): ${changed.length} changed/added/removed, ${report.length - changed.length} unchanged`);
for (const r of changed) {
  const tail = r.status !== "changed" ? ""
    : r.pageWide ? " (page-wide → full frame)"
    : ` (${(r.ratio * 100).toFixed(2)}%, cropped to ${r.bbox.w}×${r.bbox.h})`;
  console.log(`  ${r.status.padEnd(9)} ${r.id}${tail}${r.note ? " - " + r.note : ""}`);
}
