/**
 * Test to validate that all LocalIcon usages reference valid icons
 * in the Material Symbols bundle.
 *
 * This prevents missing icon errors by checking at test time rather than runtime.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('LocalIcon Validation', () => {
  it('should have all LocalIcon icons available in the icon bundle', () => {
    // Load the generated icon bundle
    const iconBundlePath = path.join(__dirname, '../../../assets/material-symbols-icons.json');
    const iconBundle = JSON.parse(fs.readFileSync(iconBundlePath, 'utf-8'));
    const availableIcons = new Set(Object.keys(iconBundle.icons || iconBundle));

    // Use grep to find all LocalIcon component usages in the codebase
    const srcPath = path.join(__dirname, '../../../');

    let grepOutput: string;
    try {
      grepOutput = execSync(
        `grep -r 'LocalIcon' --include="*.tsx" --include="*.ts" --exclude="*.test.ts" --exclude="*.test.tsx" ${srcPath} | grep 'icon='`,
        { encoding: 'utf-8' }
      );
    } catch (error: any) {
      // grep returns exit code 1 if no matches, but we want to continue
      if (error.status === 1) {
        grepOutput = '';
      } else {
        throw error;
      }
    }

    // Extract all icon names from LocalIcon usages
    // Match: icon="icon-name" (string literals only, not variables)
    const iconMatches = grepOutput.matchAll(/icon="([a-z0-9-]+)"/g);
    const usedIcons = new Set<string>();

    for (const match of iconMatches) {
      // Only add valid icon names (lowercase with hyphens, minimum 3 chars, exclude "icon" itself)
      const iconName = match[1];
      if (/^[a-z0-9-]+$/.test(iconName) && iconName.length > 2 && iconName !== 'icon') {
        usedIcons.add(iconName);
      }
    }

    // Find icons that are used but not available
    const missingIcons: string[] = [];
    for (const icon of usedIcons) {
      if (!availableIcons.has(icon)) {
        missingIcons.push(icon);
      }
    }

    // Fail the test if there are missing icons
    if (missingIcons.length > 0) {
      const errorMessage = [
        '\n❌ Found LocalIcon usages with missing icons:',
        '',
        ...missingIcons.map(icon => `  - "${icon}"`),
        '',
        'These icons do not exist in the Material Symbols icon bundle.',
        'Please use the icon generation script to see available alternatives:',
        '  npm run generate-icons:verbose',
        '',
        'Or search Material Symbols at: https://fonts.google.com/icons',
      ].join('\n');

      throw new Error(errorMessage);
    }

    // Success message
    expect(missingIcons).toHaveLength(0);
    console.log(`✅ Validated ${usedIcons.size} unique icon(s) - all present in bundle`);
  });
});
