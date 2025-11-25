import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LOGO_FOLDER_BY_VARIANT } from '@app/constants/logo';
import type { LogoVariant } from '@app/services/preferencesService';

/**
 * Tests that all required logo assets exist for each logo variant.
 * This ensures that when useLogoAssets returns paths, those files actually exist.
 */
describe('useLogoAssets - Logo Asset Files', () => {
  const publicDir = path.resolve(__dirname, '../../../public');

  // All asset files that useLogoAssets references
  const requiredAssets = [
    'logo-tooltip.svg',
    'Firstpage.png',
    'favicon.ico',
    'logo192.png',
    'logo512.png',
    'StirlingPDFLogoWhiteText.svg',
    'StirlingPDFLogoBlackText.svg',
    'StirlingPDFLogoGreyText.svg',
  ];

  const logoVariants: LogoVariant[] = ['modern', 'classic'];

  describe.each(logoVariants)('%s logo variant', (variant) => {
    const folder = LOGO_FOLDER_BY_VARIANT[variant];
    const folderPath = path.join(publicDir, folder);

    test(`folder "${folder}" should exist`, () => {
      expect(fs.existsSync(folderPath)).toBe(true);
    });

    test.each(requiredAssets)('should have %s', (assetName) => {
      const assetPath = path.join(folderPath, assetName);
      expect(
        fs.existsSync(assetPath),
        `Missing asset: ${folder}/${assetName}`
      ).toBe(true);
    });
  });

  describe('manifest files', () => {
    test('manifest.json should exist for modern variant', () => {
      const manifestPath = path.join(publicDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    test('manifest-classic.json should exist for classic variant', () => {
      const manifestPath = path.join(publicDir, 'manifest-classic.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
    });
  });
});

