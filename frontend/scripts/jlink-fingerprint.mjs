#!/usr/bin/env node
// Guards the jlink:runtime cache. The task's `status` check only proves a runtime exists, so a
// changed module list (or a different JDK) would silently reuse the previous runtime and any size
// measurement taken after it would describe the wrong artifact.
//
// Usage:
//   JLINK_MODULES=... node jlink-fingerprint.mjs write <jre-dir>
//   JLINK_MODULES=... node jlink-fingerprint.mjs check <jre-dir>
//
// Exit code 0 means the runtime matches; 1 means jlink must run again.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Bump when the jlink flags in .taskfiles/desktop.yml change.
const FLAGS_VERSION = "1";

const [mode, dir] = process.argv.slice(2);
const modules = process.env.JLINK_MODULES ?? "";
if (!mode || !dir || !modules) {
  console.error("usage: JLINK_MODULES=... jlink-fingerprint.mjs <write|check> <jre-dir>");
  process.exit(2);
}

const releaseFile = join(dir, "release");
if (!existsSync(releaseFile)) {
  process.exit(1);
}

const release = readFileSync(releaseFile, "utf8");
const javaVersion = /JAVA_VERSION="([^"]+)"/.exec(release)?.[1] ?? "unknown";
const fingerprint = `${FLAGS_VERSION}|${javaVersion}|${modules}`;
const marker = join(dir, ".stirling-jlink");

if (mode === "write") {
  writeFileSync(marker, `${fingerprint}\n`);
  process.exit(0);
}
if (mode === "check") {
  const current = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
  process.exit(current === fingerprint ? 0 : 1);
}
console.error(`unknown mode: ${mode}`);
process.exit(2);
