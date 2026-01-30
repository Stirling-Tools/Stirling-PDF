#!/usr/bin/env node
/**
 * Runs a command with sccache enabled when available.
 * Falls back to the original command if sccache is not installed.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/with-sccache.js <command> [args...]');
  process.exit(1);
}

const env = { ...process.env };
const sccacheProbe = spawnSync('sccache', ['--version'], { stdio: 'ignore' });

if (sccacheProbe.status === 0) {
  const cacheDir =
    env.SCCACHE_DIR || path.join(__dirname, '..', 'src-tauri', 'target', '.sccache');

  env.RUSTC_WRAPPER = env.RUSTC_WRAPPER || 'sccache';
  env.SCCACHE_DIR = cacheDir;
  env.SCCACHE_CACHE_SIZE = env.SCCACHE_CACHE_SIZE || '10G';
  env.SCCACHE_LOG = env.SCCACHE_LOG || 'error';

  console.log(`[with-sccache] Enabled sccache (cache: ${cacheDir})`);
} else {
  console.warn('[with-sccache] sccache not found; continuing without it.');
}

const result = spawnSync(args[0], args.slice(1), {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[with-sccache] Failed to run ${args[0]}: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
