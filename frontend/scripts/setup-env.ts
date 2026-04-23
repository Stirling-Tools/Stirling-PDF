/**
 * Copies missing env files from their .example templates, and warns about
 * any keys present in the example but not set in the environment.
 * Also warns about any VITE_ vars set in the environment that aren't listed
 * in any example file.
 *
 * Usage:
 *   tsx scripts/setup-env.ts              # checks .env
 *   tsx scripts/setup-env.ts --desktop    # also checks .env.desktop
 *   tsx scripts/setup-env.ts --saas       # also checks .env.saas
 */

import { existsSync, copyFileSync, readFileSync } from "fs";
import { join } from "path";
import { config, parse } from "dotenv";

// npm scripts run from the directory containing package.json (frontend/)
const root = process.cwd();
const args = process.argv.slice(2);
const isDesktop = args.includes("--desktop");
const isSaas = args.includes("--saas");

console.log(
  "setup-env: see frontend/README.md#environment-variables for documentation",
);

function getExampleKeys(exampleFile: string): string[] {
  const examplePath = join(root, exampleFile);
  if (!existsSync(examplePath)) return [];
  return Object.keys(parse(readFileSync(examplePath, "utf-8")));
}

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

  const missing = getExampleKeys(exampleFile).filter(
    (k) => !(k in process.env),
  );

  if (missing.length > 0) {
    console.error(
      `setup-env: ${envFile} is missing keys from ${exampleFile}:\n` +
        missing.map((k) => `  ${k}`).join("\n") +
        "\n  Add them manually or delete your local file to re-copy from the example.",
    );
    return true;
  }

  return false;
}

let failed = false;
failed = ensureEnvFile(".env", "config/.env.example") || failed;

if (isDesktop) {
  failed =
    ensureEnvFile(".env.desktop", "config/.env.desktop.example") || failed;
}

if (isSaas) {
  failed = ensureEnvFile(".env.saas", "config/.env.saas.example") || failed;
}

// Warn about any VITE_ vars set in the environment that aren't listed in any example file.
const allExampleKeys = new Set([
  ...getExampleKeys("config/.env.example"),
  ...getExampleKeys("config/.env.desktop.example"),
  ...getExampleKeys("config/.env.saas.example"),
]);
const unknownViteVars = Object.keys(process.env).filter(
  (k) => k.startsWith("VITE_") && !allExampleKeys.has(k),
);
if (unknownViteVars.length > 0) {
  console.warn(
    "setup-env: the following VITE_ vars are set but not listed in any example file:\n" +
      unknownViteVars.map((k) => `  ${k}`).join("\n") +
      "\n  Add them to the appropriate config/.env.*.example file if they are required.",
  );
}

if (failed) process.exit(1);
