// Locating the built desktop app + the PDFs the suites exercise it with.
// Shared by the WebDriver suite (wdio.conf.mjs) and the headless smoke runner.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// Sibling of editor/, deliberately NOT inside it: Tauri resolves its app dir by
// recursively searching under src-tauri's parent for a package.json, so a
// package.json anywhere below frontend/editor makes `tauri build` run
// beforeBuildCommand in the wrong directory and the vite build fails with
// "Could not resolve entry module index.html".
export const tauriDir = join(e2eDir, "..", "editor", "src-tauri");

export const isWindows = process.platform === "win32";
const exe = isWindows ? ".exe" : "";

/** Reuses the Playwright suites' fixtures rather than adding more binaries. */
export function fixture(name) {
  const path = join(
    e2eDir,
    "..",
    "editor",
    "src",
    "core",
    "tests",
    "test-fixtures",
    name,
  );
  if (!existsSync(path)) {
    throw new Error(`Missing test fixture: ${path}`);
  }
  return path;
}

/**
 * `tauri build --no-bundle` renames the Cargo artefact to `mainBinaryName`,
 * which only differs from the crate name on a case-sensitive filesystem - so
 * check both spellings, release before debug.
 */
export function resolveAppBinary() {
  if (process.env.STIRLING_APP_BINARY) {
    const explicit = process.env.STIRLING_APP_BINARY;
    if (!existsSync(explicit)) {
      throw new Error(
        `STIRLING_APP_BINARY points at a missing file: ${explicit}`,
      );
    }
    return explicit;
  }

  const candidates = [];
  for (const profile of ["release", "debug"]) {
    for (const name of ["Stirling-PDF", "stirling-pdf"]) {
      candidates.push(join(tauriDir, "target", profile, `${name}${exe}`));
    }
  }

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "No built desktop binary found. Build one first:\n" +
        "  task desktop:build:dev\n" +
        `Looked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
    );
  }
  return found;
}
