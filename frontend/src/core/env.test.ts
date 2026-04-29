import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

// frontend/ root — this file lives at src/core/env.test.ts
const frontendRoot = join(fileURLToPath(import.meta.url), "../../..");

function parseEnvKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
      if (match) keys.add(match[1]);
    }
  }
  return keys;
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && entry !== "node_modules" && entry !== "assets") {
      files.push(...collectSourceFiles(fullPath));
    } else if (
      stat.isFile() &&
      (extname(entry) === ".ts" || extname(entry) === ".tsx") &&
      !entry.endsWith(".d.ts")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function findViteEnvVars(srcDir: string): Set<string> {
  const vars = new Set<string>();
  for (const file of collectSourceFiles(srcDir)) {
    const content = readFileSync(file, "utf-8");
    for (const match of content.matchAll(/import\.meta\.env\.(VITE_\w+)/g)) {
      vars.add(match[1]);
    }
  }
  return vars;
}

describe("env vars", () => {
  it("every VITE_ var used in source is present in an example env file", () => {
    const baseEnv = readFileSync(join(frontendRoot, ".env"), "utf-8");
    const desktopEnv = readFileSync(
      join(frontendRoot, ".env.desktop"),
      "utf-8",
    );
    const saasEnv = readFileSync(join(frontendRoot, ".env.saas"), "utf-8");

    const declaredKeys = new Set([
      ...parseEnvKeys(baseEnv),
      ...parseEnvKeys(desktopEnv),
      ...parseEnvKeys(saasEnv),
    ]);
    const sourceVars = findViteEnvVars(join(frontendRoot, "src"));

    const missing = [...sourceVars].filter((v) => !declaredKeys.has(v));
    expect(
      missing,
      `Missing from 'frontend/.env*' files: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });
});
