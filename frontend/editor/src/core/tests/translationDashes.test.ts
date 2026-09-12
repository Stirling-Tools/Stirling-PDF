import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parse } from "smol-toml";

const SRC_DIR = path.join(__dirname, "../..");
const EN_US_FILE = path.join(
  __dirname,
  "../../../public/locales/en-US/translation.toml",
);

const EM_OR_EN_DASH = /[–—]/;
const LEADING_DASH = /^\s*[-–—]\s/;

const DEFAULT_PATTERNS = [
  /\bt\(\s*(["'`])[A-Za-z0-9_.-]+\1\s*,\s*(["'`])((?:[^\\]|\\.)*?)\2/gs,
  /\bdefaults\s*=\s*\{?\s*(["'`])((?:[^\\]|\\.)*?)\1/gs,
  /\b(?:labelEn|descEn|titleEn|textEn)\s*:\s*(["'`])((?:[^\\]|\\.)*?)\1/gs,
];

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...collectSourceFiles(full));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.|\.spec\.|\.stories\./.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
};

interface DefaultString {
  file: string;
  line: number;
  value: string;
}

const collectDefaultStrings = (): DefaultString[] => {
  const found: DefaultString[] = [];
  for (const file of collectSourceFiles(SRC_DIR)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [index, pattern] of DEFAULT_PATTERNS.entries()) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        found.push({
          file: path.relative(SRC_DIR, file),
          line: source.slice(0, match.index).split("\n").length,
          value: index === 0 ? match[3] : match[2],
        });
      }
    }
  }
  return found;
};

const flattenToml = (
  node: unknown,
  segments: string[] = [],
): Array<[string, string]> => {
  if (typeof node === "string") return [[segments.join("."), node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, value]) => flattenToml(value, [...segments, key]),
  );
};

const enUsEntries = flattenToml(parse(fs.readFileSync(EN_US_FILE, "utf8")));
const enUs = new Map(enUsEntries);
const defaultStrings = collectDefaultStrings();

describe("Translation dashes", () => {
  test("en-US uses hyphens, never em or en dashes", () => {
    const offenders = enUsEntries
      .filter(([, value]) => EM_OR_EN_DASH.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  test("inline i18n defaults use hyphens, never em or en dashes", () => {
    expect(defaultStrings.length).toBeGreaterThan(100);
    const offenders = defaultStrings
      .filter((entry) => EM_OR_EN_DASH.test(entry.value))
      .map((entry) => `${entry.file}:${entry.line}`);
    expect(offenders).toEqual([]);
  });

  test("no en-US value or inline default opens with a bare dash", () => {
    const offenders = [
      ...enUsEntries
        .filter(([, value]) => LEADING_DASH.test(value))
        .map(([key]) => key),
      ...defaultStrings
        .filter((entry) => LEADING_DASH.test(entry.value))
        .map((entry) => `${entry.file}:${entry.line}`),
    ];
    expect(offenders).toEqual([]);
  });

  test.each([
    ["cookieBanner.popUp.description.1", "for you - helping"],
    [
      "cookieBanner.preferencesModal.analytics.description",
      "assured - Stirling",
    ],
    [
      "cookieBanner.preferencesModal.description.2",
      "cannot - and will never - track",
    ],
    [
      "cookieBanner.preferencesModal.necessary.description",
      "forms - which is why",
    ],
    ["pdfTextEditor.tooltip.alpha.text", "evolving - certain"],
    ["scannerImageSplit.tooltip.headsUpDesc", "accuracy - try"],
    [
      "scannerImageSplit.tooltip.whatThisDoesDesc",
      "image - no manual cropping",
    ],
  ])("%s separates its clauses with a spaced hyphen", (key, fragment) => {
    expect(enUs.get(key)).toContain(fragment);
  });
});
