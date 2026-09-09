import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

// Class names are neither typechecked nor resolved at build time, so a stylesheet
// whose selector prefix drifts from its markup still compiles, still ships, and
// silently drops every rule in the block.

const PROCESSOR_ROOT = path.resolve(__dirname);
const CSS_CLASS_SELECTOR = /\.portal-[A-Za-z0-9_-]+/g;
const CLASS_NAME_ATTRIBUTE =
  /class(?:Name)?\s*=\s*\{?[^\n]*?portal-[A-Za-z0-9_-]+/g;

function collectFiles(
  dir: string,
  extensions: Set<string>,
  acc: string[] = [],
) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      collectFiles(full, extensions, acc);
    } else if (extensions.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function hits(file: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [index, line] of fs
    .readFileSync(file, "utf8")
    .split("\n")
    .entries()) {
    for (const match of line.matchAll(pattern)) {
      found.push(
        `${path.relative(PROCESSOR_ROOT, file)}:${index + 1} ${match[0].trim()}`,
      );
    }
  }
  return found;
}

describe("processor styling prefix", () => {
  it("declares no legacy portal- class selectors", () => {
    const stylesheets = collectFiles(PROCESSOR_ROOT, new Set([".css"]));
    expect(stylesheets.length).toBeGreaterThan(0);
    expect(stylesheets.flatMap((f) => hits(f, CSS_CLASS_SELECTOR))).toEqual([]);
  });

  it("renders no legacy portal- class names", () => {
    const markup = collectFiles(PROCESSOR_ROOT, new Set([".tsx"]));
    expect(markup.length).toBeGreaterThan(0);
    expect(markup.flatMap((f) => hits(f, CLASS_NAME_ATTRIBUTE))).toEqual([]);
  });
});
