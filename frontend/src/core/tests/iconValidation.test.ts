import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Icon validation', () => {
  it('should only use icons that exist in the bundle', () => {
    const usedIcons = new Set<string>();
    const srcDir = path.join(__dirname, '..', '..');

    // Load the icon bundle
    const iconSetPath = path.join(srcDir, 'assets', 'material-symbols-icons.json');
    const iconSet = JSON.parse(fs.readFileSync(iconSetPath, 'utf8'));
    const availableIcons = new Set(Object.keys(iconSet.icons || {}));

    // Recursively scan all .tsx and .ts files
    function scanDirectory(dir: string) {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip node_modules, assets, and test-fixtures
          if (file === 'node_modules' || file === 'assets' || file === 'test-fixtures') {
            return;
          }
          scanDirectory(filePath);
        } else if ((file.endsWith('.tsx') || file.endsWith('.ts')) && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) {
          const content = fs.readFileSync(filePath, 'utf8');
          const relPath = path.relative(srcDir, filePath);

          // Match LocalIcon usage: <LocalIcon icon="icon-name" ...>
          const localIconMatches = content.match(/<LocalIcon\s+[^>]*icon="([^"]+)"/g);
          if (localIconMatches) {
            localIconMatches.forEach(match => {
              const iconMatch = match.match(/icon="([^"]+)"/);
              if (iconMatch) {
                const iconName = iconMatch[1].replace('material-symbols:', '');
                usedIcons.add(iconName);
              }
            });
          }

          // Match React.createElement(LocalIcon, { icon: 'icon-name', ... })
          const createElementMatches = content.match(/React\.createElement\(LocalIcon,\s*\{[^}]*icon:\s*['"]([^'"]+)['"]/g);
          if (createElementMatches) {
            createElementMatches.forEach(match => {
              const iconMatch = match.match(/icon:\s*['"]([^'"]+)['"]/);
              if (iconMatch) {
                const iconName = iconMatch[1].replace('material-symbols:', '');
                usedIcons.add(iconName);
              }
            });
          }

          // Match Icon component usage: <Icon icon="material-symbols:icon-name" ...>
          const iconMatches = content.match(/<Icon\s+[^>]*icon="material-symbols:([^"]+)"/g);
          if (iconMatches) {
            iconMatches.forEach(match => {
              const iconMatch = match.match(/icon="material-symbols:([^"]+)"/);
              if (iconMatch) {
                usedIcons.add(iconMatch[1]);
              }
            });
          }

          // Match icon strings with common Material Symbols suffixes
          const iconStringMatches = content.match(/['"]([a-z][a-z0-9-]*(?:-rounded|-outline|-sharp))['"][,\s})]/g);
          if (iconStringMatches) {
            iconStringMatches.forEach(match => {
              const iconMatch = match.match(/['"]([a-z][a-z0-9-]*(?:-rounded|-outline|-sharp))['"][,\s})]/);
              if (iconMatch && iconMatch[1]) {
                const iconName = iconMatch[1];
                // Skip common false positives
                if (!iconName.includes('/') &&
                    !iconName.startsWith('--') &&
                    iconName.length < 50) {
                  usedIcons.add(iconName);
                }
              }
            });
          }
        }
      });
    }

    scanDirectory(srcDir);

    // Check for missing icons
    const missingIcons: string[] = [];
    usedIcons.forEach(iconName => {
      if (!availableIcons.has(iconName)) {
        missingIcons.push(iconName);
      }
    });

    // Fail if any icons are missing
    if (missingIcons.length > 0) {
      const errorMessage = `Found ${missingIcons.length} icon(s) that don't exist in Material Symbols:\n` +
        missingIcons.map(icon => `  - "${icon}"`).join('\n') + '\n\n' +
        'Run "npm run generate-icons" to update the bundle, or fix the icon names.\n' +
        'Search available icons at: https://fonts.google.com/icons';

      expect(missingIcons, errorMessage).toEqual([]);
    }

    // Log summary
    console.log(`✅ Validated ${usedIcons.size} icon references - all exist in bundle`);
  });
});
