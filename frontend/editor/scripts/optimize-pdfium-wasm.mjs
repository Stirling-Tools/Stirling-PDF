// Optimize the shipped pdfium.wasm with wasm-opt (binaryen).
//
// Runs as a postinstall script (see package.json). Skips when:
//   - wasm-opt is not on PATH (dev machines without binaryen)
//   - the sentinel file matches the current input hash (already optimized)
//   - the input is not found (package not yet installed / hoisting race)
//
// Tries both -O3 and -Oz and keeps whichever result is smaller, only
// replacing the shipped binary when the optimized output is strictly smaller.
// The sentinel then prevents repeat work on every `npm install`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// npm may hoist @embedpdf/pdfium to the workspace root (frontend/node_modules)
// instead of frontend/editor/node_modules; check both locations.
const candidates = [
  path.resolve(dirname, "../node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
  path.resolve(dirname, "../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
];
const wasmPath = candidates.find((p) => fs.existsSync(p));
const sentinelPath = path.resolve(dirname, ".pdfium-wasm-optimized");

function hasWasmOpt() {
  try {
    execFileSync("wasm-opt", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function runWasmOpt(input, output, level) {
  execFileSync(
    "wasm-opt",
    [input, level, "--enable-simd", "--enable-bulk-memory", "-o", output],
    { stdio: "inherit" },
  );
}

try {
  if (!wasmPath) {
    console.log("[optimize-pdfium-wasm] input not found; skipping.");
    process.exit(0);
  }

  const inputHash = sha256(wasmPath);
  if (fs.existsSync(sentinelPath)) {
    const sentinel = fs.readFileSync(sentinelPath, "utf8").trim();
    if (sentinel === inputHash) {
      console.log("[optimize-pdfium-wasm] already optimized; skipping.");
      process.exit(0);
    }
  }

  if (!hasWasmOpt()) {
    console.log(
      "[optimize-pdfium-wasm] wasm-opt not found on PATH; skipping. " +
        "Install binaryen to shrink the wasm at build time.",
    );
    process.exit(0);
  }

  const tmpO3 = `${wasmPath}.opt-o3.wasm`;
  const tmpOz = `${wasmPath}.opt-oz.wasm`;
  runWasmOpt(wasmPath, tmpO3, "-O3");
  runWasmOpt(wasmPath, tmpOz, "-Oz");

  const original = fs.statSync(wasmPath).size;
  const sizeO3 = fs.statSync(tmpO3).size;
  const sizeOz = fs.statSync(tmpOz).size;
  const best = sizeO3 <= sizeOz ? tmpO3 : tmpOz;
  const bestSize = Math.min(sizeO3, sizeOz);

  if (bestSize < original) {
    fs.copyFileSync(best, wasmPath);
    const pct = (((original - bestSize) / original) * 100).toFixed(1);
    console.log(
      `[optimize-pdfium-wasm] optimized ${original} -> ${bestSize} bytes (-${pct}%)`,
    );
  } else {
    console.log(
      "[optimize-pdfium-wasm] wasm-opt produced no smaller binary; keeping original.",
    );
  }

  fs.rmSync(tmpO3, { force: true });
  fs.rmSync(tmpOz, { force: true });
  fs.writeFileSync(sentinelPath, inputHash);
} catch (err) {
  console.warn(
    "[optimize-pdfium-wasm] optimization failed:",
    err?.message ?? err,
  );
  process.exit(0);
}
