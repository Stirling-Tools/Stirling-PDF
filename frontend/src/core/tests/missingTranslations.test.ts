import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { parse } from 'smol-toml';

const REPO_ROOT = path.join(__dirname, '../../../..');
const SRC_ROOT = path.join(__dirname, '../..');
const EN_GB_FILE = path.join(__dirname, '../../../public/locales/en-GB/translation.toml');

const IGNORED_DIRS = new Set([
  'tests',
  '__mocks__',
]);
const IGNORED_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.test\./,
  /\.spec\./,
  /\.stories\./,
];
const IGNORED_KEYS = new Set<string>([
  // If the script has found a false-positive that shouldn't be in the translations, include it here
]);

type FoundKey = {
  key: string;
  fallback: string;
  file: string;
  line: number;
  column: number;
};

const flattenKeys = (node: unknown, prefix = '', acc = new Set<string>()): Set<string> => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    if (prefix) {
      acc.add(prefix);
    }
    return acc;
  }

  for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${childKey}` : childKey;
    flattenKeys(value, next, acc);
  }

  return acc;
};

const listSourceFiles = (): string[] => {
  const files = ts.sys.readDirectory(SRC_ROOT, ['.ts', '.tsx', '.js', '.jsx'], undefined, [
    '**/*',
  ]);

  return files
    .filter((file) => !file.split(path.sep).some((segment) => IGNORED_DIRS.has(segment)))
    .filter((file) => !IGNORED_FILE_PATTERNS.some((re) => re.test(file)));
};

const getScriptKind = (file: string): ts.ScriptKind => {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (file.endsWith('.ts')) {
    return ts.ScriptKind.TS;
  }

  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  return ts.ScriptKind.JS;
};

/**
 * Find all of the static first keys for translation functions that we can.
 * Ignores dynamic strings because we can't know what the actual translation key will be.
 */
const extractKeys = (file: string): FoundKey[] => {
  const code = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file),
  );

  const found: FoundKey[] = [];

  const record = (node: ts.Node, key: string, fallback: string = "") => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    found.push({ key, fallback, file, line: line + 1, column: character + 1 });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg0 = node.arguments.at(0);
      const arg1 = node.arguments.at(1);

      const isT =
        (ts.isIdentifier(callee) && callee.text === 't') ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === 't');

      if (isT && arg0 && (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0))) {
        let arg1Text: string = "";
        if (arg1 && (ts.isStringLiteral(arg1) || ts.isNoSubstitutionTemplateLiteral(arg1))) {
          arg1Text = arg1.text;
        }
        record(arg0, arg0.text, arg1Text);
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const attr of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(attr) ||
          attr.name.getText(sourceFile) !== 'i18nKey' ||
          !attr.initializer
        ) {
          continue;
        }

        const init = attr.initializer;

        if (ts.isStringLiteral(init)) {
          record(init, init.text);
          continue;
        }

        if (
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

describe('Missing translation coverage', () => {
  test('fails if any en-GB translation key used in source is missing', () => {
    expect(fs.existsSync(EN_GB_FILE)).toBe(true);

    const localeContent = fs.readFileSync(EN_GB_FILE, 'utf8');
    const enGb = parse(localeContent);
    const availableKeys = flattenKeys(enGb);

    const usedKeys = listSourceFiles()
      .flatMap(extractKeys)
      .filter(({ key }) => !IGNORED_KEYS.has(key));
    expect(usedKeys.length).toBeGreaterThan(100); // Sanity check

    const missingKeys = usedKeys.filter(({ key }) => !availableKeys.has(key));

    const annotations = missingKeys.map(({ key, fallback, file, line, column }) => {
      const workspaceRelativeRaw = path.relative(REPO_ROOT, file);
      const workspaceRelativeFile = workspaceRelativeRaw.replace(/\\/g, '/');

      return {
        key,
        fallback,
        file: workspaceRelativeFile,
        line,
        column,
      };
    });

    // Output errors in GitHub Annotations format so they appear tagged in the code in CI
    for (const { key, fallback, file, line, column } of annotations) {
      process.stderr.write(
        `::error file=${file},line=${line},col=${column}::Missing en-GB translation for ${key} (${fallback})\n`,
      );
    }

    const neatened = annotations.map(({ key, fallback, file, line, column }) => {
      return {
        key,
        fallback,
        location: `${file}:${line}:${column}`,
      }
    });

    expect(neatened).toEqual([]);
  });
});
