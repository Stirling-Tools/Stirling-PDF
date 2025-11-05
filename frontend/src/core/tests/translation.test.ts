import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';

const LOCALES_DIR = path.join(__dirname, '../../../public/locales');

// Get all locale directories for parameterized tests
const getLocaleDirectories = () => {
  if (!fs.existsSync(LOCALES_DIR)) {
    return [];
  }

  return fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
};

const localeDirectories = getLocaleDirectories();

describe('Translation TOML Validation', () => {
  test('should find the locales directory', () => {
    expect(fs.existsSync(LOCALES_DIR)).toBe(true);
  });

  test('should have at least one locale directory', () => {
    expect(localeDirectories.length).toBeGreaterThan(0);
  });

  test.each(localeDirectories)('should have valid TOML in %s/translation.toml', (localeDir) => {
    const translationFile = path.join(LOCALES_DIR, localeDir, 'translation.toml');

    // Check if file exists
    expect(fs.existsSync(translationFile)).toBe(true);

    // Read file content
    const content = fs.readFileSync(translationFile, 'utf8');
    expect(content.trim()).not.toBe('');

    // Parse TOML - this will throw if invalid TOML
    let tomlData;
    expect(() => {
      tomlData = parse(content);
    }).not.toThrow();

    // Ensure it's an object at root level
    expect(typeof tomlData).toBe('object');
    expect(tomlData).not.toBeNull();
    expect(Array.isArray(tomlData)).toBe(false);
  });
});
