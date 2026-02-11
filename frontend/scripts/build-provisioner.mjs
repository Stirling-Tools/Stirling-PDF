import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32') {
  process.exit(0);
}

const frontendDir = process.cwd();
const tauriDir = resolve(frontendDir, 'src-tauri');
const provisionerManifest = join(tauriDir, 'provisioner', 'Cargo.toml');

execFileSync(
  'cargo',
  ['build', '--release', '--manifest-path', provisionerManifest],
  { stdio: 'inherit' }
);

const provisionerExe = join(tauriDir, 'provisioner', 'target', 'release', 'stirling-provisioner.exe');
if (!existsSync(provisionerExe)) {
  throw new Error(`Provisioner binary not found at ${provisionerExe}`);
}

const wixDir = join(tauriDir, 'windows', 'wix');
mkdirSync(wixDir, { recursive: true });

const destExe = join(wixDir, 'stirling-provision.exe');
copyFileSync(provisionerExe, destExe);
