/**
 * Shared translation-coverage engine for the frontend i18n suites.
 *
 * The editor and the portal both keep UI strings in a US-English source locale
 * (`public/locales/en-US/translation.toml`) and look them up with
 * react-i18next's `t()`. These helpers walk a project's source via the
 * TypeScript AST (finding static `t("...")` keys, `i18nKey` props, and dynamic
 * template-key shapes), flatten its locale to a key set, and report drift in
 * both directions:
 *   - **missing**: a key used in source with no entry in the locale
 *   - **unused**:  a locale key no source reference (static or dynamic) reaches
 *
 * The Vitest suites in `editor/src/core/tests/` run these over every entry in
 * {@link I18N_PROJECTS}, so one implementation guards both apps.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";
import { parse } from "smol-toml";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // frontend/shared/i18n
const FRONTEND_ROOT = path.resolve(HERE, "../.."); // frontend
/** Repo root, for rendering source paths relative in CI annotations. */
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");

export interface TranslationProject {
  /** Group name in the test output. */
  name: string;
  /** Absolute path to the source tree to scan. */
  srcRoot: string;
  /**
   * Extra source trees that also contribute used keys (e.g. the shared layer
   * (frontend/shared), whose components (login UI, etc.) are rendered by both
   * apps and reference each app's locale keys).
   */
  extraRoots?: string[];
  /** Absolute path to the en-US source locale. */
  localeFile: string;
  /** Static keys flagged as missing that are genuinely fine (false positives). */
  ignoredKeys?: Set<string>;
  /** Locale keys assembled at runtime; exempt from the unused check. */
  ignoredKeyPatterns?: RegExp[];
  /** Sanity floor: a working scan finds at least this many used keys. */
  minUsedKeys?: number;
  /** Sanity floor: a working parse finds at least this many locale keys. */
  minLocaleKeys?: number;
}

export interface MissingKey {
  key: string;
  fallback: string;
  /** Absolute path; relativise against {@link REPO_ROOT} for annotations. */
  file: string;
  line: number;
  column: number;
}

const IGNORED_DIRS = new Set(["tests", "__mocks__"]);
const IGNORED_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.test\./,
  /\.spec\./,
  /\.stories\./,
];
const LIKELY_TRANSLATION_USAGE_RE = /(?:^|[^\w$])t\s*\(|\.t\s*\(|\bi18nKey\b/;
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

const front = (rel: string): string => path.join(FRONTEND_ROOT, rel);

// The shared layer is rendered by both apps, so its translation usage counts
// toward each project (or keys used only from shared look unused, and a shared
// component's keys go unvalidated against an app's locale).
const SHARED_SRC = front("shared");

/**
 * The projects the i18n suites guard. Each carries its own ignore lists: the
 * editor exempts a few runtime-assembled key families; the portal starts clean.
 */
export const I18N_PROJECTS: TranslationProject[] = [
  {
    name: "editor",
    srcRoot: front("editor/src"),
    extraRoots: [SHARED_SRC],
    localeFile: front("editor/public/locales/en-US/translation.toml"),
    ignoredKeyPatterns: [
      // SignSettings / SavedSignaturesSection resolve every key as
      // t(`${scope}.${key}`); scope and leaf only ever exist as separate literals.
      /^(sign|addText|addImage)\./,
      // SettingsSearchBar indexes whole subtrees via t(prefix, { returnObjects }).
      /^admin\.settings\./,
      /^settings\./,
      /^account\./,
      // [language] direction is read by the i18n layer, never as a UI string.
      /^language\.direction$/,
    ],
    minUsedKeys: 100,
    minLocaleKeys: 100,
  },
  {
    name: "portal",
    srcRoot: front("portal/src"),
    extraRoots: [SHARED_SRC],
    localeFile: front("portal/public/locales/en-US/translation.toml"),
    ignoredKeyPatterns: [
      // Source-type copy is referenced via metadata keys in
      // components/sources/sourceTypes.ts (t(field.labelKey)), so the static
      // scan can't see these as used.
      /^sources\.types\./,
    ],
    minUsedKeys: 20,
    minLocaleKeys: 20,
  },
];

// Locale tables are shallow by design; the cap only trips on a pathological
// or malformed file and turns it into a clear error.
const MAX_LOCALE_DEPTH = 50;

/**
 * Flatten a parsed TOML locale to its set of leaf keys.
 *
 * Iterative (explicit-stack) traversal rather than recursion, so a deeply
 * nested or malformed locale walks the heap, never the call stack.
 */
export function flattenLocaleKeys(
  node: unknown,
  prefix = "",
  acc = new Set<string>(),
): Set<string> {
  const stack: Array<{ node: unknown; prefix: string; depth: number }> = [
    { node, prefix, depth: 0 },
  ];
  while (stack.length > 0) {
    const { node: current, prefix: currentPrefix, depth } = stack.pop()!;
    if (depth > MAX_LOCALE_DEPTH) {
      throw new Error(
        `Locale nesting exceeded ${MAX_LOCALE_DEPTH} levels at "${currentPrefix}"`,
      );
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      if (currentPrefix) acc.add(currentPrefix);
      continue;
    }
    for (const [childKey, value] of Object.entries(
      current as Record<string, unknown>,
    )) {
      stack.push({
        node: value,
        prefix: currentPrefix ? `${currentPrefix}.${childKey}` : childKey,
        depth: depth + 1,
      });
    }
  }
  return acc;
}

export function collectLocaleKeys(localeFile: string): Set<string> {
  // Callers pass fixed project paths from I18N_PROJECTS, but this reader is
  // exported: keep the resolved path inside the frontend tree so a future
  // caller can't turn it into a path-traversal read.
  const resolved = path.resolve(localeFile);
  if (
    resolved !== FRONTEND_ROOT &&
    !resolved.startsWith(FRONTEND_ROOT + path.sep)
  ) {
    throw new Error(`Locale path escapes the frontend root: ${localeFile}`);
  }
  return flattenLocaleKeys(parse(fs.readFileSync(resolved, "utf8")));
}

const getScriptKind = (file: string): ts.ScriptKind => {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
};

const listSourceFiles = (roots: string[]): string[] =>
  roots
    .flatMap((root) =>
      ts.sys.readDirectory(root, [".ts", ".tsx", ".js", ".jsx"], undefined, [
        "**/*",
      ]),
    )
    .filter(
      (file) =>
        !file.split(path.sep).some((segment) => IGNORED_DIRS.has(segment)),
    )
    .filter((file) => !IGNORED_FILE_PATTERNS.some((re) => re.test(file)));

const projectRoots = (project: TranslationProject): string[] => [
  project.srcRoot,
  ...(project.extraRoots ?? []),
];

const hasPluralCoverage = (key: string, available: Set<string>): boolean =>
  [...available].some(
    (k) => k.startsWith(`${key}_`) && PLURAL_SUFFIX_RE.test(k),
  );

const getLookupKeys = (key: string): string[] => {
  const base = key.replace(PLURAL_SUFFIX_RE, "");
  return base === key ? [key] : [key, base];
};

/**
 * Static first-argument keys of `t()` calls plus `i18nKey` JSX props. Dynamic
 * (template) keys are out of scope here; see the unused check's shape matching.
 */
const extractStaticKeys = (file: string): MissingKey[] => {
  const code = fs.readFileSync(file, "utf8");
  if (!LIKELY_TRANSLATION_USAGE_RE.test(code)) return [];

  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file),
  );
  const found: MissingKey[] = [];

  const record = (node: ts.Node, key: string, fallback = "") => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(),
    );
    found.push({ key, fallback, file, line: line + 1, column: character + 1 });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg0 = node.arguments.at(0);
      const arg1 = node.arguments.at(1);
      const isT =
        (ts.isIdentifier(callee) && callee.text === "t") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "t");
      if (
        isT &&
        arg0 &&
        (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0))
      ) {
        const fallback =
          arg1 &&
          (ts.isStringLiteral(arg1) || ts.isNoSubstitutionTemplateLiteral(arg1))
            ? arg1.text
            : "";
        record(arg0, arg0.text, fallback);
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const attr of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(attr) ||
          attr.name.getText(sourceFile) !== "i18nKey" ||
          !attr.initializer
        ) {
          continue;
        }
        const init = attr.initializer;
        if (ts.isStringLiteral(init)) {
          record(init, init.text);
        } else if (
          ts.isJsxExpression(init) &&
          init.expression &&
          ts.isStringLiteral(init.expression)
        ) {
          record(init.expression, init.expression.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return found;
};

/**
 * Template-literal shapes that could form a dotted key, with each `${...}`
 * replaced by `*` (e.g. `nav.${id}` → `nav.*`). Collected from every template
 * (not just t() sites; keys are often assembled in helpers/constants), but
 * only kept if a shape carries an identifier-like static fragment.
 */
const extractTemplateShapes = (file: string, acc: Set<string>): void => {
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
  // Each * is one runtime path segment, so match `[^.]+` (not `.+`) to avoid
  // spanning key levels. Multi-segment interpolations use ignoredKeyPatterns.
  const escaped = shape
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^.]+");
  return new RegExp(`^${escaped}$`);
};

/** Used keys with no locale entry (their fallback would render instead). */
export function findMissingKeys(project: TranslationProject): {
  missing: MissingKey[];
  usedCount: number;
} {
  const localeKeys = collectLocaleKeys(project.localeFile);
  const ignored = project.ignoredKeys ?? new Set<string>();

  // A used key resolves if the locale has it exactly, a plural variant covers
  // it, or it drills into an ancestor leaf, e.g. `t("...bullets.0")` indexing
  // the array stored at `...bullets` (arrays flatten to their base key).
  const resolves = (key: string): boolean => {
    if (localeKeys.has(key) || hasPluralCoverage(key, localeKeys)) return true;
    const parts = key.split(".");
    for (let i = parts.length - 1; i > 0; i--) {
      if (localeKeys.has(parts.slice(0, i).join("."))) return true;
    }
    return false;
  };

  const used = listSourceFiles(projectRoots(project))
    .flatMap(extractStaticKeys)
    .filter(({ key }) => !ignored.has(key));
  const missing = used.filter(({ key }) => !resolves(key));
  return { missing, usedCount: used.length };
}

/** Locale keys no source reference (static or dynamic) can reach. */
export function findUnusedKeys(project: TranslationProject): {
  unused: string[];
  localeCount: number;
} {
  const localeKeys = Array.from(collectLocaleKeys(project.localeFile));
  const files = listSourceFiles(projectRoots(project));
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  const shapes = new Set<string>();
  for (const file of files) extractTemplateShapes(file, shapes);
  const matchers = [...shapes].map(shapeToMatcher);
  const patterns = project.ignoredKeyPatterns ?? [];

  const unused = localeKeys.filter((key) => {
    if (patterns.some((re) => re.test(key))) return false;
    const lookups = getLookupKeys(key);
    // Direct: the literal appears anywhere in source (static t(), i18nKey,
    // constants, comments). Plural variants count when their base is referenced.
    if (lookups.some((k) => source.includes(k))) return false;
    // Dynamic: the key matches a template-literal shape from source.
    return !lookups.some((k) => matchers.some((re) => re.test(k)));
  });

  return { unused, localeCount: localeKeys.length };
}
