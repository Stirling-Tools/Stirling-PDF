import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.platform !== "win32") {
  process.exit(0);
}

const frontendDir = process.cwd();
const tauriDir = resolve(frontendDir, "src-tauri");
const provisionerManifest = join(tauriDir, "provisioner", "Cargo.toml");

execFileSync("cargo", ["build", "--release", "--manifest-path", provisionerManifest], { stdio: "inherit" });

const provisionerExe = join(tauriDir, "provisioner", "target", "release", "stirling-provisioner.exe");
if (!existsSync(provisionerExe)) {
  throw new Error(`Provisioner binary not found at ${provisionerExe}`);
}

const wixDir = join(tauriDir, "windows", "wix");
mkdirSync(wixDir, { recursive: true });

const destExe = join(wixDir, "stirling-provision.exe");
copyFileSync(provisionerExe, destExe);

// --- Thumbnail handler DLL ---
const thumbManifest = join(tauriDir, "thumbnail-handler", "Cargo.toml");

execFileSync("cargo", ["build", "--release", "--manifest-path", thumbManifest], { stdio: "inherit" });

const thumbDll = join(tauriDir, "thumbnail-handler", "target", "release", "stirling_thumbnail_handler.dll");
if (!existsSync(thumbDll)) {
  throw new Error(`Thumbnail handler DLL not found at ${thumbDll}`);
}

copyFileSync(thumbDll, join(wixDir, "stirling_thumbnail_handler.dll"));
