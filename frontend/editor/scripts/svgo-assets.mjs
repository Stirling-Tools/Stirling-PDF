// Minify the brand SVGs (src/core/assets/brand/**) with SVGO: strips editor
// metadata, doctypes, unused defs, and collapse redundant paths so the shipped
// .svg files are as small as possible before Vite hashes + precompresses them.
//
// Run manually (npm run optimize:svg) or from CI; the output is committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const roots = [
  path.resolve(dirname, "../src/core/assets/brand/classic-logo"),
  path.resolve(dirname, "../src/core/assets/brand/modern-logo"),
];

const svgoConfig = {
  multipass: true,
  plugins: [
    "preset-default",
    "removeDimensions",
    {
      name: "removeViewBox",
      active: false,
    },
  ],
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (entry.name.endsWith(".svg")) files.push(p);
  }
  return files;
}

let total = 0;
let saved = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    const input = fs.readFileSync(file, "utf8");
    const result = optimize(input, { path: file, ...svgoConfig });
    const out = result.data;
    total += Buffer.byteLength(input);
    saved += Buffer.byteLength(input) - Buffer.byteLength(out);
    fs.writeFileSync(file, out);
  }
}
console.log(
  `[svgo-assets] minified brand SVGs, saved ${saved} bytes (${total} -> ${total - saved})`,
);
