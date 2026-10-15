/**
 * Writes the locale files the app fetches at runtime.
 *
 * `public/locales/<lng>/translation.toml` stays the authoring format - Crowdin
 * writes it, the structure tests read it - but shipping it as-is costs every
 * visitor whose language is not en-US a second full dictionary, because
 * i18next loads the fallback language eagerly. Each delivery file is therefore
 * the locale's own strings with the en-US values merged in for keys the locale
 * does not define: the same result the runtime fallback would have produced,
 * from one request, without the TOML parse.
 *
 * Only keys the locale is missing are filled, so an empty string or a short
 * string stays the translator's decision rather than being overwritten.
 *
 * Invoked by the `locale-assets` plugin in vite.config.ts for both dev and
 * build; can also be run directly:
 *   node editor/scripts/generate-locale-assets.mjs [--force]
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { parse } from "smol-toml";

const HERE = import.meta.dirname;
const LOCALES_DIR = resolve(HERE, "../public/locales");
const SOURCE_LOCALE = "en-US";
const AUTHORED = "translation.toml";
const DELIVERED = "translation.json";

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Fills keys `target` does not define from `source`, in place. Arrays are
 * leaves: a locale that translated two of three items keeps its own list
 * rather than inheriting the source's.
 */
function fillFromFallback(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) {
      target[key] = value;
    } else if (isPlainObject(target[key]) && isPlainObject(value)) {
      fillFromFallback(target[key], value);
    }
  }
  return target;
}

const localeCodes = () =>
  readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((code) =>
      exists(join(LOCALES_DIR, code, AUTHORED)),
    )
    .sort();

const exists = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const mtimeOf = (path) => statSync(path).mtimeMs;

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

/**
 * Generates every delivery file. Returns what was written so a caller can log
 * a summary; skips locales whose delivery file is already newer than both the
 * authored file and this script unless `force` is set.
 */
export function generateLocaleAssets({ force = false, log = () => {} } = {}) {
  const scriptMtime = mtimeOf(join(HERE, "generate-locale-assets.mjs"));
  const sourcePath = join(LOCALES_DIR, SOURCE_LOCALE, AUTHORED);
  const source = parse(readFileSync(sourcePath, "utf8"));
  const sourceJson = JSON.stringify(source);

  const written = [];
  let skipped = 0;
  let fallbackBytes = Buffer.byteLength(sourceJson);

  for (const code of localeCodes()) {
    const authoredPath = join(LOCALES_DIR, code, AUTHORED);
    const deliveredPath = join(LOCALES_DIR, code, DELIVERED);
    const newestInput = Math.max(mtimeOf(authoredPath), scriptMtime);
    if (!force && exists(deliveredPath) && mtimeOf(deliveredPath) >= newestInput) {
      skipped += 1;
      continue;
    }

    const authored = parse(readFileSync(authoredPath, "utf8"));
    const delivery =
      code === SOURCE_LOCALE ? authored : fillFromFallback(authored, source);
    const json = code === SOURCE_LOCALE ? sourceJson : JSON.stringify(delivery);
    writeFileSync(deliveredPath, json);
    written.push({ code, bytes: Buffer.byteLength(json) });
  }

  if (written.length === 0) {
    log(`[locales] ${skipped} delivery files already current`);
    return { written, skipped, fallbackBytes };
  }

  const largest = written.reduce((max, entry) =>
    entry.bytes > max.bytes ? entry : max,
  );
  log(
    `[locales] wrote ${written.length} delivery files (${skipped} current); ` +
      `largest ${largest.code} ${kib(largest.bytes)} raw; source dictionary ` +
      `${kib(fallbackBytes)} raw, ${kib(brotliCompressSync(sourceJson).length)} brotli, ` +
      `${kib(gzipSync(sourceJson).length)} gzip`,
  );
  return { written, skipped, fallbackBytes };
}

/** Locale codes that actually get a delivery file, for the startup preload. */
export function deliveredLocaleCodes() {
  return localeCodes();
}

if (process.argv[1] === import.meta.filename) {
  generateLocaleAssets({
    force: process.argv.includes("--force"),
    log: (message) => console.log(message),
  });
}
