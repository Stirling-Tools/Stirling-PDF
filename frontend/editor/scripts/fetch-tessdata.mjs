#!/usr/bin/env node
// Fetches the OCR languages the desktop app ships with into src-tauri/tessdata,
// which tauri.conf.json bundles. URLs and checksums come from the same pinned
// catalogue the backend installs languages from, so a bundled file is
// byte-identical to one installed later. Files already present and verified
// are kept, so repeat builds stay offline.
//
// Usage: fetch-tessdata.mjs <catalog.json> <destDir> <code> [code...]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [catalogPath, destDir, ...codes] = process.argv.slice(2);
if (!catalogPath || !destDir || codes.length === 0) {
  console.error(
    "Usage: fetch-tessdata.mjs <catalog.json> <destDir> <code> [code...]",
  );
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

mkdirSync(destDir, { recursive: true });
for (const code of codes) {
  const entry = catalog.languages.find((language) => language.code === code);
  if (!entry) {
    console.error(`${code} is not in ${catalogPath}`);
    process.exit(1);
  }
  const target = join(destDir, `${code}.traineddata`);
  if (existsSync(target) && sha256(readFileSync(target)) === entry.sha256) {
    console.log(`${code}: already present`);
    continue;
  }
  const url = `${catalog.baseUrl}${code}.traineddata`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`${code}: HTTP ${response.status} from ${url}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== entry.sha256) {
    console.error(`${code}: checksum mismatch for ${url}`);
    process.exit(1);
  }
  writeFileSync(target, bytes);
  console.log(`${code}: fetched ${bytes.length} bytes`);
}
