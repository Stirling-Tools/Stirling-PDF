import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  process.exit(0);
}

// build-provisioner is invoked from the workspace root (frontend/); resolve
// src-tauri relative to this script so it doesn't depend on cwd.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const editorDir = resolve(scriptDir, "..");
const tauriDir = resolve(editorDir, "src-tauri");
const provisionerManifest = join(tauriDir, "provisioner", "Cargo.toml");

execFileSync(
  "cargo",
  ["build", "--release", "--manifest-path", provisionerManifest],
  { stdio: "inherit" },
);

const provisionerExe = join(
  tauriDir,
  "provisioner",
  "target",
  "release",
  "stirling-provisioner.exe",
);
if (!existsSync(provisionerExe)) {
  throw new Error(`Provisioner binary not found at ${provisionerExe}`);
}

const wixDir = join(tauriDir, "windows", "wix");
mkdirSync(wixDir, { recursive: true });

const destExe = join(wixDir, "stirling-provision.exe");
copyFileSync(provisionerExe, destExe);

// --- Thumbnail handler DLL ---
const thumbManifest = join(tauriDir, "thumbnail-handler", "Cargo.toml");

execFileSync(
  "cargo",
  ["build", "--release", "--manifest-path", thumbManifest],
  { stdio: "inherit" },
);

const thumbDll = join(
  tauriDir,
  "thumbnail-handler",
  "target",
  "release",
  "stirling_thumbnail_handler.dll",
);
if (!existsSync(thumbDll)) {
  throw new Error(`Thumbnail handler DLL not found at ${thumbDll}`);
}

copyFileSync(thumbDll, join(wixDir, "stirling_thumbnail_handler.dll"));

// --- OCR setup custom action ---
// A DLL rather than an exe, and not by preference: an MSI custom action of type
// EXE runs out of process and is never handed the installer session handle, so
// it cannot drive the progress bar. A DLL entry point receives the MSIHANDLE.
const ocrSetupManifest = join(tauriDir, "ocr-setup", "Cargo.toml");

execFileSync(
  "cargo",
  ["build", "--release", "--manifest-path", ocrSetupManifest],
  { stdio: "inherit" },
);

const ocrSetupDll = join(
  tauriDir,
  "ocr-setup",
  "target",
  "release",
  "stirling_ocr_setup.dll",
);
if (!existsSync(ocrSetupDll)) {
  throw new Error(`OCR setup DLL not found at ${ocrSetupDll}`);
}

copyFileSync(ocrSetupDll, join(wixDir, "stirling_ocr_setup.dll"));
