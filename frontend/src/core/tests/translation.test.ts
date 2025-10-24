import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

describe('Translation JSON Validation', () => {
  test('should find the locales directory', () => {
    expect(fs.existsSync(LOCALES_DIR)).toBe(true);
  });

  test('should have at least one locale directory', () => {
    expect(localeDirectories.length).toBeGreaterThan(0);
  });

  test.each(localeDirectories)('should have valid JSON in %s/translation.json', (localeDir) => {
    const translationFile = path.join(LOCALES_DIR, localeDir, 'translation.json');

    // Check if file exists
    expect(fs.existsSync(translationFile)).toBe(true);

    // Read file content
    const content = fs.readFileSync(translationFile, 'utf8');
    expect(content.trim()).not.toBe('');

    // Parse JSON - this will throw if invalid JSON
    let jsonData;
    expect(() => {
      jsonData = JSON.parse(content);
    }).not.toThrow();

    // Ensure it's an object at root level
    expect(typeof jsonData).toBe('object');
    expect(jsonData).not.toBeNull();
    expect(Array.isArray(jsonData)).toBe(false);
  });
});
