/**
 * Copies missing env files from their .example templates, and warns about
 * any keys present in the example but not set in the environment.
 *
 * Usage:
 *   tsx scripts/setup-env.ts              # checks .env
 *   tsx scripts/setup-env.ts --desktop    # also checks .env.desktop
 */

import { existsSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { config, parse } from 'dotenv';

// npm scripts run from the directory containing package.json (frontend/)
const root = process.cwd();
const args = process.argv.slice(2);
const isDesktop = args.includes('--desktop');

function ensureEnvFile(envFile: string, exampleFile: string): boolean {
  const envPath = join(root, envFile);
  const examplePath = join(root, exampleFile);

  if (!existsSync(examplePath)) {
    console.warn(`setup-env: ${exampleFile} not found, skipping ${envFile}`);
    return false;
  }

  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.log(`setup-env: created ${envFile} from ${exampleFile}`);
  }

  config({ path: envPath });

  const exampleKeys = Object.keys(parse(readFileSync(examplePath, 'utf-8')));
  const missing = exampleKeys.filter(k => !(k in process.env));

  if (missing.length > 0) {
    console.error(
      `setup-env: ${envFile} is missing keys from ${exampleFile}:\n` +
      missing.map(k => `  ${k}`).join('\n') +
      '\n  Add them manually or delete your local file to re-copy from the example.'
    );
    return true;
  }

  return false;
}

let failed = false;
failed = ensureEnvFile('.env', '.env.example') || failed;

if (isDesktop) {
  failed = ensureEnvFile('.env.desktop', '.env.desktop.example') || failed;
}

if (failed) process.exit(1);
