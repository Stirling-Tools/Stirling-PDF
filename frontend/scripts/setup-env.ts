/**
 * Copies missing env files from their .example templates.
 * Run before dev/build commands to ensure env files exist.
 *
 * Usage:
 *   tsx scripts/setup-env.ts              # copies .env if missing
 *   tsx scripts/setup-env.ts --desktop    # also copies .env.desktop if missing
 */

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

// npm scripts run from the directory containing package.json (frontend/)
const root = process.cwd();
const args = process.argv.slice(2);
const isDesktop = args.includes('--desktop');

function ensureEnvFile(envFile: string, exampleFile: string): void {
  const envPath = join(root, envFile);
  const examplePath = join(root, exampleFile);

  if (existsSync(envPath)) return;

  if (!existsSync(examplePath)) {
    console.warn(`setup-env: ${exampleFile} not found, skipping ${envFile}`);
    return;
  }

  copyFileSync(examplePath, envPath);
  console.log(`setup-env: created ${envFile} from ${exampleFile}`);
}

ensureEnvFile('.env', '.env.example');

if (isDesktop) {
  ensureEnvFile('.env.desktop', '.env.desktop.example');
}
