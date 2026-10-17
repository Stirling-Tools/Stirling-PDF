/** Writes the locale files the app fetches at runtime. */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { parse } from "smol-toml";

const HERE = import.meta.dirname;
const LOCALES_DIR = resolve(HERE, "../public/locales");
const SOURCE_LOCALE = "en-US";
const AUTHORED = "translation.toml";
const DELIVERED = "translation.json";
const STARTUP = "startup.json";
const STARTUP_KEYS = resolve(HERE, "locale-startup-keys.json");

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Fills keys `target` does not define from `source`, in place. */
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

/** True when a dot-separated path resolves to something the app can render. */
function definesKey(dictionary, path) {
  let current = dictionary;
  for (const part of path.split(".")) {
    if (!isPlainObject(current) || !(part in current)) return false;
    current = current[part];
  }
  return !isPlainObject(current);
}

function readStartupKeys(source, path = STARTUP_KEYS) {
  const keys = JSON.parse(readFileSync(path, "utf8"));
  const unknown = keys.filter((key) => !definesKey(source, key));
  if (unknown.length > 0) {
    throw new Error(
      `${path} lists keys ${SOURCE_LOCALE}/${AUTHORED} does not define: ` +
        `${unknown.join(", ")}. Re-record them with tests/walkthrough/perf/probe-keys.mjs.`,
    );
  }
  return keys;
}

/** The subset of `dictionary` the startup list names, nested as i18next stores it. */
function pickStartupKeys(dictionary, keys) {
  const subset = {};
  for (const key of keys) {
    const parts = key.split(".");
    const leaf = parts.pop();
    let from = dictionary;
    let into = subset;
    for (const part of parts) {
      if (!isPlainObject(from) || !isPlainObject(from[part])) {
        from = null;
        break;
      }
      from = from[part];
      into = into[part] ?? (into[part] = {});
    }
    if (!from) continue;
    for (const [name, value] of Object.entries(from)) {
      if (name === leaf || name.startsWith(`${leaf}_`)) into[name] = value;
    }
  }
  return subset;
}

const localeCodes = (dir = LOCALES_DIR) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((code) => exists(join(dir, code, AUTHORED)))
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

/** Generates every delivery file. */
export function generateLocaleAssets({
  force = false,
  log = () => {},
  localesDir = LOCALES_DIR,
  startupKeysPath = STARTUP_KEYS,
} = {}) {
  const scriptMtime = mtimeOf(join(HERE, "generate-locale-assets.mjs"));
  const sourcePath = join(localesDir, SOURCE_LOCALE, AUTHORED);
  const source = parse(readFileSync(sourcePath, "utf8"));
  const sourceJson = JSON.stringify(source);
  const keys = readStartupKeys(source, startupKeysPath);
  const keysMtime = mtimeOf(startupKeysPath);
  const sourceStartupJson = JSON.stringify(pickStartupKeys(source, keys));

  const written = [];
  let skipped = 0;
  const fallbackBytes = Buffer.byteLength(sourceJson);

  for (const code of localeCodes(localesDir)) {
    const authoredPath = join(localesDir, code, AUTHORED);
    const deliveredPath = join(localesDir, code, DELIVERED);
    const startupPath = join(localesDir, code, STARTUP);
    // The source locale is merged into every delivery, so a change there makes
    // this language's files stale even though its own file did not move.
    const newestInput = Math.max(
      mtimeOf(authoredPath),
      mtimeOf(sourcePath),
      keysMtime,
      scriptMtime,
    );
    if (
      !force &&
      exists(deliveredPath) &&
      mtimeOf(deliveredPath) >= newestInput &&
      exists(startupPath) &&
      mtimeOf(startupPath) >= newestInput
    ) {
      skipped += 1;
      continue;
    }

    const authored = parse(readFileSync(authoredPath, "utf8"));
    const delivery =
      code === SOURCE_LOCALE ? authored : fillFromFallback(authored, source);
    const json = code === SOURCE_LOCALE ? sourceJson : JSON.stringify(delivery);
    writeFileSync(deliveredPath, json);

    const startupJson = JSON.stringify(pickStartupKeys(delivery, keys));
    writeFileSync(startupPath, startupJson);
    written.push({ code, bytes: Buffer.byteLength(json) });
  }

  const startupBytes = Buffer.byteLength(sourceStartupJson);
  if (written.length === 0) {
    log(
      `[locales] ${skipped} delivery files already current; startup subset ` +
        `${keys.length} keys, ${kib(startupBytes)} raw, ` +
        `${kib(brotliCompressSync(sourceStartupJson).length)} brotli`,
    );
    return { written, skipped, fallbackBytes, startupBytes };
  }

  const largest = written.reduce((max, entry) =>
    entry.bytes > max.bytes ? entry : max,
  );
  log(
    `[locales] wrote ${written.length} delivery files (${skipped} current); ` +
      `largest ${largest.code} ${kib(largest.bytes)} raw; source dictionary ` +
      `${kib(fallbackBytes)} raw, ${kib(brotliCompressSync(sourceJson).length)} brotli, ` +
      `${kib(gzipSync(sourceJson).length)} gzip; startup subset ${keys.length} keys, ` +
      `${kib(startupBytes)} raw, ${kib(brotliCompressSync(sourceStartupJson).length)} brotli, ` +
      `${kib(gzipSync(sourceStartupJson).length)} gzip`,
  );
  return { written, skipped, fallbackBytes, startupBytes };
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
