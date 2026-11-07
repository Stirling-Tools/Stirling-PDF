#!/usr/bin/env node
// Trains the AOT cache backend.rs passes to the backend; run on the final src-tauri layout, as
// the JVM rejects it once jar paths relative to the JRE or jar mtimes change. STIRLING_SKIP_AOT=1 skips.
// Usage: train-aot-cache.mjs <src-tauri dir>
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tauriDir = resolve(process.argv[2] ?? "src-tauri");
const libsDir = join(tauriDir, "libs");
const java = join(
  tauriDir,
  "runtime",
  "jre",
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);

if (process.env.STIRLING_SKIP_AOT === "1") {
  console.log("STIRLING_SKIP_AOT=1, not training an AOT cache");
  process.exit(0);
}

const jars = existsSync(libsDir)
  ? readdirSync(libsDir).filter((n) => /^stirling-pdf-.*\.jar$/.test(n))
  : [];
if (jars.length !== 1 || !existsSync(java)) {
  console.error(
    `Need exactly one staged stirling-pdf jar in ${libsDir} and a JRE at ${java}; run desktop:jlink first.`,
  );
  process.exit(1);
}
const jar = join(libsDir, jars[0]);

// Names match Rust's std::env::consts::ARCH, which the launcher uses to pick a cache.
const HOST_ARCH = { x64: "x86_64", arm64: "aarch64" }[process.arch];
function arches() {
  // Rosetta runs x86_64 on Apple silicon, but nothing runs arm64 on an Intel Mac.
  if (process.platform !== "darwin" || HOST_ARCH === "x86_64")
    return [HOST_ARCH];
  const slices = execFileSync("lipo", ["-archs", java]).toString();
  return ["aarch64", "x86_64"].filter((a) =>
    slices.includes(a === "aarch64" ? "arm64" : a),
  );
}

for (const name of readdirSync(libsDir).filter((n) => n.endsWith(".aot"))) {
  rmSync(join(libsDir, name), { force: true });
}

for (const arch of arches()) {
  const cache = join(libsDir, `stirling-${arch}.aot`);
  const work = mkdtempSync(join(tmpdir(), "stirling-aot-"));
  // Heap and GC flags must match backend.rs: the cache is rejected if they differ.
  const args = [
    "-Xmx2g",
    `-XX:AOTCacheOutput=${cache}`,
    "-Dspring.context.exit=onRefresh",
    "-DBROWSER_OPEN=false",
    "-DSTIRLING_PDF_TAURI_MODE=true",
    "-Dserver.port=0",
    "-Dsecurity.enableLogin=false",
    "-Dsecurity.csrfDisabled=true",
    "-jar",
    jar,
  ];
  const crossArch = process.platform === "darwin" && arch !== HOST_ARCH;
  const [cmd, cmdArgs] = crossArch
    ? ["arch", ["-x86_64", java, ...args]]
    : [java, args];
  console.log(`Training AOT cache for ${arch} (takes a few minutes)...`);
  const run = spawnSync(cmd, cmdArgs, {
    cwd: work,
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 20 * 60 * 1000,
    env: {
      ...process.env,
      TAURI_PARENT_PID: String(process.pid),
      STIRLING_PDF_CONFIG_DIR: join(work, "configs"),
      STIRLING_PDF_LOG_DIR: join(work, "logs"),
      STIRLING_PDF_WORK_DIR: work,
    },
  });
  rmSync(work, { recursive: true, force: true });
  if (run.status !== 0 || !existsSync(cache) || statSync(cache).size < 1e6) {
    console.error(
      `AOT training for ${arch} failed (exit ${run.status}${run.error ? `, ${run.error.message}` : ""}).`,
    );
    process.exit(1);
  }
  console.log(
    `Wrote ${cache} (${Math.round(statSync(cache).size / 1048576)} MB)`,
  );
}
