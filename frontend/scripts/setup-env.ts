/**
 * Ensures `.env.local` (and mode-specific `.env.desktop.local` / `.env.saas.local`)
 * files exist so developers have a place to put overrides (API keys, machine-specific
 * settings) without touching the committed `.env` / `.env.desktop` / `.env.saas` files.
 *
 * Vite automatically layers these `.local` files on top of the committed ones.
 *
 * Usage:
 *   tsx scripts/setup-env.ts              # ensures .env.local
 *   tsx scripts/setup-env.ts --desktop    # also ensures .env.desktop.local
 *   tsx scripts/setup-env.ts --saas       # also ensures .env.saas.local
 */

import { existsSync, writeFileSync } from "fs";
import { join } from "path";

// npm scripts run from the directory containing package.json (frontend/)
const root = process.cwd();
const args = process.argv.slice(2);
const isDesktop = args.includes("--desktop");
const isSaas = args.includes("--saas");

function template(parent: string): string {
  return [
    "###############################################################################",
    `# Local overrides for \`frontend/${parent}\``,
    "# Put API keys and machine-specific settings here. Any variable defined here",
    `# takes precedence over the committed \`${parent}\``,
    "###############################################################################",
    "",
  ].join("\n");
}

function ensureLocalFile(localFile: string, parentFile: string): void {
  const localPath = join(root, localFile);
  if (!existsSync(localPath)) {
    writeFileSync(localPath, template(parentFile));
    console.log(`setup-env: created empty ${localFile} for local overrides`);
  }
}

ensureLocalFile(".env.local", ".env");
if (isDesktop) ensureLocalFile(".env.desktop.local", ".env.desktop");
if (isSaas) ensureLocalFile(".env.saas.local", ".env.saas");
