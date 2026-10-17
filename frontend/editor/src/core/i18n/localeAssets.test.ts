import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// oxlint-disable-next-line no-restricted-imports -- the generator is a build script, outside the @app alias
import { generateLocaleAssets } from "../../../scripts/generate-locale-assets.mjs";

const AUTHORED = "translation.toml";
const SOURCE = 'app.name = "Stirling"\napp.title = "App"\n';

let dir: string;
let keysPath: string;

const author = (code: string, toml: string): string => {
  mkdirSync(join(dir, code), { recursive: true });
  const path = join(dir, code, AUTHORED);
  writeFileSync(path, toml);
  return path;
};

const touch = (path: string, when: Date): void => {
  utimesSync(path, when, when);
};

const read = (code: string, file: string): unknown =>
  JSON.parse(readFileSync(join(dir, code, file), "utf8"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "locale-assets-"));
  keysPath = join(dir, "startup-keys.json");
  writeFileSync(keysPath, JSON.stringify(["app.name", "app.title"]));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("generateLocaleAssets", () => {
  it("writes both delivery files per language", () => {
    author("en-US", SOURCE);
    author("de-DE", SOURCE);

    const { written } = generateLocaleAssets({
      localesDir: dir,
      startupKeysPath: keysPath,
    });

    expect(written.map((entry) => entry.code)).toEqual(["de-DE", "en-US"]);
    expect(read("de-DE", "translation.json")).toEqual({
      app: { name: "Stirling", title: "App" },
    });
    expect(read("de-DE", "startup.json")).toEqual({
      app: { name: "Stirling", title: "App" },
    });
  });

  it("regenerates a language when only the source locale changes", () => {
    author("en-US", SOURCE);
    const german = author("de-DE", 'app.name = "Stirling"\n');
    generateLocaleAssets({ localesDir: dir, startupKeysPath: keysPath });

// The source string changes and is touched; every other language's files stay exactly as fresh as they were.
    const english = author("en-US", 'app.name = "Stirling"\napp.title = "Editor"\n');
    const now = new Date();
    touch(join(dir, "de-DE", "translation.json"), now);
    touch(join(dir, "de-DE", "startup.json"), now);
    touch(german, now);
    touch(english, new Date(now.getTime() + 5_000));

    const { written } = generateLocaleAssets({
      localesDir: dir,
      startupKeysPath: keysPath,
    });

    expect(written.map((entry) => entry.code)).toContain("de-DE");
    expect(read("de-DE", "translation.json")).toEqual({
      app: { name: "Stirling", title: "Editor" },
    });
    expect(read("de-DE", "startup.json")).toEqual({
      app: { name: "Stirling", title: "Editor" },
    });
  });

  it("skips languages whose files are current", () => {
    author("en-US", SOURCE);
    author("de-DE", SOURCE);
    generateLocaleAssets({ localesDir: dir, startupKeysPath: keysPath });

    const { written, skipped } = generateLocaleAssets({
      localesDir: dir,
      startupKeysPath: keysPath,
    });

    expect(written).toEqual([]);
    expect(skipped).toBe(2);
  });
});
