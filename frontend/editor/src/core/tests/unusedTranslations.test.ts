import fs from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { parse } from "smol-toml";

const REPO_ROOT = path.join(__dirname, "../../../..");
const SRC_ROOT = path.join(__dirname, "../..");
const EN_US_FILE = path.join(
  __dirname,
  "../../../public/locales/en-US/translation.toml",
);

const IGNORED_DIRS = new Set(["tests", "__mocks__"]);
const IGNORED_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.test\./,
  /\.spec\./,
  /\.stories\./,
];
const PLURAL_SUFFIX_PATTERN = /_(zero|one|two|few|many|other)$/;

/**
 * Keys that look unused to the heuristic but are genuinely used: keep them.
 * These are families assembled at runtime, so no static fragment ever reaches
 * source code for the literal/template matching to catch. Add a regex here
 * (with a comment naming the runtime usage) rather than teaching the test
 * about specific component internals. For a single key, anchor it: /^a\.b$/.
 */
const IGNORED_KEY_PATTERNS: RegExp[] = [
  // SignSettings / SavedSignaturesSection look up every key as
  // t(`${translationScope}.${key}`); the scope ("sign" | "addText" |
  // "addImage") and the relative key only ever exist as separate literals.
  /^(sign|addText|addImage)\./,
  // SettingsSearchBar builds its search index by loading whole subtrees via
  // t(prefix, { returnObjects: true }); the leaf keys never appear in source.
  /^admin\.settings\./,
  /^settings\./,
  /^account\./,
];

const flattenKeys = (
  node: unknown,
  prefix = "",
  acc = new Set<string>(),
): Set<string> => {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    if (prefix) {
      acc.add(prefix);
    }
    return acc;
  }

  for (const [childKey, value] of Object.entries(
    node as Record<string, unknown>,
  )) {
    const next = prefix ? `${prefix}.${childKey}` : childKey;
    flattenKeys(value, next, acc);
  }

  return acc;
};

const listSourceFiles = (): string[] => {
  const files = ts.sys.readDirectory(
    SRC_ROOT,
    [".ts", ".tsx", ".js", ".jsx"],
    undefined,
    ["**/*"],
  );

  return files
    .filter(
      (file) =>
        !file.split(path.sep).some((segment) => IGNORED_DIRS.has(segment)),
    )
    .filter((file) => !IGNORED_FILE_PATTERNS.some((re) => re.test(file)));
};

const getScriptKind = (file: string): ts.ScriptKind => {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
};

/**
 * Walk each file's AST and collect every template literal whose static parts
 * could plausibly form a dotted translation key. Each shape replaces ${...}
 * interpolations with `*`, e.g. `tools.${id}.title` becomes `tools.*.title`.
 *
 * We deliberately collect *all* template literals (not just those at t()
 * call sites), because keys are often built up in helpers, constants or
 * config objects and only passed to t() somewhere far away. A shape only
 * counts if it carries at least one identifier-like static fragment though,
 * so generic templates like `${name}.${ext}` (shape `*.*`) are discarded.
 *
 * Using the AST (rather than a backtick-pair regex) is important: source
 * files contain large multi-line templates with embedded CSS/HTML and
 * nested interpolations that confuse regex-based pairing.
 */
const extractTemplateShapesFromFile = (
  file: string,
  acc: Set<string>,
): void => {
  const code = fs.readFileSync(file, "utf8");
  if (!code.includes("${")) return;

  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    false,
    getScriptKind(file),
  );

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      let shape = node.head.text;
      for (const span of node.templateSpans) {
        shape += "*";
        shape += span.literal.text;
      }
      if (
        shape.includes(".") &&
        /[A-Za-z0-9_-]/.test(shape.replace(/\*/g, ""))
      ) {
        acc.add(shape);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
};

const shapeToMatcher = (shape: string): RegExp => {
  // Each * stands in for one runtime-supplied path segment. We use `[^.]+`
  // (not `.+`) so a one-variable interpolation doesn't accidentally span
  // multiple key levels. If a real interpolation does carry a multi-segment
  // string, the IGNORED_KEY_PATTERNS list is the escape hatch.
  const escaped = shape
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^.]+");
  return new RegExp(`^${escaped}$`);
};

const isIgnored = (key: string): boolean => {
  return IGNORED_KEY_PATTERNS.some((re) => re.test(key));
};

const getTranslationLookupKeys = (key: string): string[] => {
  const pluralBaseKey = key.replace(PLURAL_SUFFIX_PATTERN, "");
  if (pluralBaseKey === key) {
    return [key];
  }

  return [key, pluralBaseKey];
};

describe("Unused translation coverage", () => {
  test(
    "fails if any en-US translation key has no source references",
    { timeout: 30_000 },
    () => {
      expect(fs.existsSync(EN_US_FILE)).toBe(true);

      const enUs = parse(fs.readFileSync(EN_US_FILE, "utf8"));
      const availableKeys = Array.from(flattenKeys(enUs));
      expect(availableKeys.length).toBeGreaterThan(100); // sanity check

      const sourceFiles = listSourceFiles();
      expect(sourceFiles.length).toBeGreaterThan(0);

      const source = sourceFiles
        .map((file) => fs.readFileSync(file, "utf8"))
        .join("\n");

      const shapes = new Set<string>();
      for (const file of sourceFiles) {
        extractTemplateShapesFromFile(file, shapes);
      }
      const shapeMatchers = Array.from(shapes).map(shapeToMatcher);

      const unused = availableKeys.filter((key) => {
        if (isIgnored(key)) return false;
        const lookupKeys = getTranslationLookupKeys(key);
        // Direct: the full key text appears anywhere in source (catches
        // static t() calls, i18nKey props, constants, and any other place
        // the literal string sits in code or comments). Plural variants also
        // count as used when their base key is referenced because i18next
        // resolves suffixes like _one/_other from a single base lookup.
        if (lookupKeys.some((lookupKey) => source.includes(lookupKey))) {
          return false;
        }
        // Dynamic: the key matches a template-literal shape from source.
        return !lookupKeys.some((lookupKey) =>
          shapeMatchers.some((re) => re.test(lookupKey)),
        );
      });

      const localeRelative = path
        .relative(REPO_ROOT, EN_US_FILE)
        .replace(/\\/g, "/");

      // GitHub Annotations format so unused keys show up tagged on the
      // translation file in CI.
      for (const key of unused) {
        process.stderr.write(
          `::error file=${localeRelative}::Unused en-US translation: ${key}\n`,
        );
      }

      expect(
        unused,
        `Found ${unused.length} unused en-US translation key(s). ` +
          `Remove them from ${localeRelative}, or (if the usage is too ` +
          `dynamic for the heuristic to spot) add to IGNORED_KEY_PATTERNS ` +
          `in this test.`,
      ).toEqual([]);
    },
  );
});
