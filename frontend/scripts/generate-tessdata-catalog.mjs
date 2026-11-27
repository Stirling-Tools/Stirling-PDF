#!/usr/bin/env node
// Builds the OCR language catalogue the backend installs from (and
// fetch-tessdata.mjs bundles from): every model in one tesseract-ocr tessdata
// repository at a pinned commit, with its size and SHA-256. Git symlinks are
// skipped, because their raw URL serves the target's name, not a model.
// Downloads every model once to hash it (about 1.1 GB for tessdata_best).
//
// Usage: generate-tessdata-catalog.mjs <owner/repo> <commit> <out.json>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const [repo, commit, outPath] = process.argv.slice(2);
if (!repo || !commit || !outPath) {
  console.error(
    "Usage: generate-tessdata-catalog.mjs <owner/repo> <commit> <out.json>",
  );
  process.exit(1);
}

const tree = await (
  await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit}`)
).json();
if (!Array.isArray(tree.tree) || tree.truncated) {
  console.error(`Could not list ${repo}@${commit}: ${JSON.stringify(tree)}`);
  process.exit(1);
}
const models = tree.tree
  .filter((e) => e.path.endsWith(".traineddata") && e.mode !== "120000")
  .map((e) => ({ code: e.path.slice(0, -".traineddata".length), size: e.size }))
  .sort((a, b) => a.code.localeCompare(b.code));
const baseUrl = `https://raw.githubusercontent.com/${repo}/${commit}/`;

async function hash({ code, size }) {
  const response = await fetch(`${baseUrl}${code}.traineddata`);
  if (!response.ok) throw new Error(`${code}: HTTP ${response.status}`);
  const digest = createHash("sha256");
  let read = 0;
  for await (const chunk of response.body) {
    digest.update(chunk);
    read += chunk.length;
  }
  if (read !== size)
    throw new Error(`${code}: ${read} bytes, tree says ${size}`);
  return { code, sizeBytes: size, sha256: digest.digest("hex") };
}

const results = new Array(models.length);
let next = 0;
async function worker() {
  while (next < models.length) {
    const i = next++;
    results[i] = await hash(models[i]);
    console.log(`${i + 1}/${models.length} ${models[i].code}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const lines = results.map(
  (r) =>
    `  ${JSON.stringify(r).replaceAll('":', '": ').replaceAll(',"', ', "')}`,
);
writeFileSync(
  outPath,
  `{\n "source": "${repo}",\n "commit": "${commit}",\n "baseUrl": "${baseUrl}",\n "languages": [\n${lines.join(",\n")}\n ]\n}\n`,
);
console.log(`Wrote ${results.length} models to ${outPath}`);
