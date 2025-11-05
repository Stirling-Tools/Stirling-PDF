import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';

const LOCALES_DIR = path.join(__dirname, '../../../public/locales');

const getLocaleDirectories = () => {
  if (!fs.existsSync(LOCALES_DIR)) {
    return [];
  }

  return fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
};

const findDottedKeys = (node: unknown, segments: string[] = []): string[] => {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const issues: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.includes('.')) {
      issues.push([...segments, key].join('.'));
    }
    issues.push(...findDottedKeys(value, [...segments, key]));
  }
  return issues;
};

const localeDirectories = getLocaleDirectories();

describe('Translation key structure', () => {
  test('should locate locales directory', () => {
    expect(fs.existsSync(LOCALES_DIR)).toBe(true);
  });

  test('should have at least one locale directory', () => {
    expect(localeDirectories.length).toBeGreaterThan(0);
  });

  test.each(localeDirectories)('should not contain dotted keys in %s/translation.toml', (localeDir) => {
    const translationFile = path.join(LOCALES_DIR, localeDir, 'translation.toml');
    expect(fs.existsSync(translationFile)).toBe(true);

    const data = parse(fs.readFileSync(translationFile, 'utf8'));
    const dottedKeys = findDottedKeys(data);
    expect(dottedKeys, `Dotted keys found in ${localeDir}: ${dottedKeys.join(', ')}`).toHaveLength(0);
  });
});
