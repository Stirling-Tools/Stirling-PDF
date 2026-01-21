#!/usr/bin/env node

const { icons } = require('@iconify-json/material-symbols');
const fs = require('fs');
const path = require('path');

// Check for verbose flag
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');

// Logging functions
const info = (message) => console.log(message);
const debug = (message) => {
  if (isVerbose) {
    console.log(message);
  }
};

// Function to scan codebase for LocalIcon usage
function scanForUsedIcons() {
  const usedIcons = new Set();
  const srcDir = path.join(__dirname, '..', 'src');

  info('🔍 Scanning codebase for LocalIcon usage...');

  if (!fs.existsSync(srcDir)) {
    console.error('❌ Source directory not found:', srcDir);
    process.exit(1);
  }

  // Recursively scan all .tsx and .ts files
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Match LocalIcon usage: <LocalIcon icon="icon-name" ...>
        const localIconMatches = content.match(/<LocalIcon\s+[^>]*icon="([^"]+)"/g);
        if (localIconMatches) {
          localIconMatches.forEach(match => {
            const iconMatch = match.match(/icon="([^"]+)"/);
            if (iconMatch) {
              usedIcons.add(iconMatch[1]);
              debug(`  Found: ${iconMatch[1]} in ${path.relative(srcDir, filePath)}`);
            }
          });
        }

        // Match LocalIcon usage: <LocalIcon icon='icon-name' ...>
        const localIconSingleQuoteMatches = content.match(/<LocalIcon\s+[^>]*icon='([^']+)'/g);
        if (localIconSingleQuoteMatches) {
          localIconSingleQuoteMatches.forEach(match => {
            const iconMatch = match.match(/icon='([^']+)'/);
            if (iconMatch) {
              usedIcons.add(iconMatch[1]);
              debug(`  Found: ${iconMatch[1]} in ${path.relative(srcDir, filePath)}`);
            }
          });
        }

        // Match old material-symbols-rounded spans: <span className="material-symbols-rounded">icon-name</span>
        const spanMatches = content.match(/<span[^>]*className="[^"]*material-symbols-rounded[^"]*"[^>]*>([^<]+)<\/span>/g);
        if (spanMatches) {
          spanMatches.forEach(match => {
            const iconMatch = match.match(/>([^<]+)<\/span>/);
            if (iconMatch && iconMatch[1].trim()) {
              const iconName = iconMatch[1].trim();
              usedIcons.add(iconName);
              debug(`  Found (legacy): ${iconName} in ${path.relative(srcDir, filePath)}`);
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
              debug(`  Found (Icon): ${iconMatch[1]} in ${path.relative(srcDir, filePath)}`);
            }
          });
        }

        // Match icon config usage: icon: 'icon-name' or icon: "icon-name"
        const iconPropertyMatches = content.match(/icon:\s*(['"])([a-z0-9-]+)\1/g);
        if (iconPropertyMatches) {
          iconPropertyMatches.forEach(match => {
            const iconMatch = match.match(/icon:\s*(['"])([a-z0-9-]+)\1/);
            if (iconMatch) {
              usedIcons.add(iconMatch[2]);
              debug(`  Found (config): ${iconMatch[2]} in ${path.relative(srcDir, filePath)}`);
            }
          });
        }
      }
    });
  }

  scanDirectory(srcDir);

  const iconArray = Array.from(usedIcons).sort();
  info(`📋 Found ${iconArray.length} unique icons across codebase`);

  return iconArray;
}

// Main async function
async function main() {
  // Auto-detect used icons
  const usedIcons = scanForUsedIcons();

  // Check if we need to regenerate (compare with existing)
  const outputPath = path.join(__dirname, '..', 'src', 'assets', 'material-symbols-icons.json');
  let needsRegeneration = true;

  if (fs.existsSync(outputPath)) {
    try {
      const existingSet = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const existingIcons = Object.keys(existingSet.icons || {}).sort();
      const currentIcons = [...usedIcons].sort();

      if (JSON.stringify(existingIcons) === JSON.stringify(currentIcons)) {
        needsRegeneration = false;
        info(`✅ Icon set already up-to-date (${usedIcons.length} icons, ${Math.round(fs.statSync(outputPath).size / 1024)}KB)`);
      }
    } catch {
      // If we can't parse existing file, regenerate
      needsRegeneration = true;
    }
  }

  if (!needsRegeneration) {
    info('🎉 No regeneration needed!');
    process.exit(0);
  }

  info(`🔍 Extracting ${usedIcons.length} icons from Material Symbols...`);

  // Dynamic import of ES module
  const { getIcons } = await import('@iconify/utils');

  // Extract only our used icons from the full set
  const extractedIcons = getIcons(icons, usedIcons);

  if (!extractedIcons) {
    console.error('❌ Failed to extract icons');
    process.exit(1);
  }

  // Check for missing icons
  const extractedIconNames = Object.keys(extractedIcons.icons || {});
  const missingIcons = usedIcons.filter(icon => !extractedIconNames.includes(icon));

  if (missingIcons.length > 0) {
    info(`⚠️  Missing icons (${missingIcons.length}): ${missingIcons.join(', ')}`);
    info('💡 These icons don\'t exist in Material Symbols. Please use available alternatives.');
  }

  // Create output directory
  const outputDir = path.join(__dirname, '..', 'src', 'assets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the extracted icon set to a file (outputPath already defined above)
  fs.writeFileSync(outputPath, JSON.stringify(extractedIcons, null, 2));

  info(`✅ Successfully extracted ${Object.keys(extractedIcons.icons || {}).length} icons`);
  info(`📦 Bundle size: ${Math.round(JSON.stringify(extractedIcons).length / 1024)}KB`);
  info(`💾 Saved to: ${outputPath}`);

  // Generate TypeScript types
  const typesContent = `// Auto-generated icon types
// This file is automatically generated by scripts/generate-icons.js
// Do not edit manually - changes will be overwritten

export type MaterialSymbolIcon = ${usedIcons.map(icon => `'${icon}'`).join(' | ')};

export interface IconSet {
  prefix: string;
  icons: Record<string, any>;
  width?: number;
  height?: number;
}

// Re-export the icon set as the default export with proper typing
declare const iconSet: IconSet;
export default iconSet;
`;

  const typesPath = path.join(outputDir, 'material-symbols-icons.d.ts');
  fs.writeFileSync(typesPath, typesContent);

  info(`📝 Generated types: ${typesPath}`);
  info(`🎉 Icon extraction complete!`);
}

// Run the main function
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
