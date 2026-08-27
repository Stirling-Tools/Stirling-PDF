import { describe, expect, test } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  LOGO_FOLDER_BY_VARIANT,
  WORDMARK_FILES_BY_VARIANT,
} from "@app/constants/logo";
import type { LogoVariant } from "@app/services/preferencesService";

/**
 * Tests that all required logo assets exist for each logo variant.
 * This ensures that when useLogoAssets returns paths, those files actually exist.
 */
describe("useLogoAssets - Logo Asset Files", () => {
  const publicDir = path.resolve(__dirname, "../../../public");
  // Brand logo assets live in core; the editor's vite config copies
  // core/assets/brand/<folder>/* into the served root at build time (see
  // viteStaticCopy in editor/vite.config.ts), so useLogoAssets can keep
  // referencing them by their public-URL path. Validate them at source.
  const brandDir = path.resolve(__dirname, "../assets/brand");

  // Asset files useLogoAssets references for every variant.
  const requiredAssets = [
    "logo-tooltip.svg",
    "Firstpage.png",
    "favicon.ico",
    "logo192.png",
    "logo512.png",
    "StirlingPDFLogoNoTextDark.svg",
    "StirlingPDFLogoNoTextLight.svg",
  ];

  const logoVariants: LogoVariant[] = ["modern", "classic"];

  describe.each(logoVariants)("%s logo variant", (variant) => {
    const folder = LOGO_FOLDER_BY_VARIANT[variant];
    const folderPath = path.join(brandDir, folder);

    test(`folder "${folder}" should exist`, () => {
      expect(fs.existsSync(folderPath)).toBe(true);
    });

    test.each(requiredAssets)("should have %s", (assetName) => {
      const assetPath = path.join(folderPath, assetName);
      expect(
        fs.existsSync(assetPath),
        `Missing asset: ${folder}/${assetName}`,
      ).toBe(true);
    });

    test.each(Object.entries(WORDMARK_FILES_BY_VARIANT[variant]))(
      "should have the %s wordmark (%s)",
      (_tone, assetName) => {
        const assetPath = path.join(folderPath, assetName);
        expect(
          fs.existsSync(assetPath),
          `Missing asset: ${folder}/${assetName}`,
        ).toBe(true);
      },
    );
  });

  // Regression guard: modern once shipped byte-identical copies of the classic
  // wordmarks, so every <Wordmark> rendered the old artwork on the default variant.
  describe("modern artwork must not be a copy of classic", () => {
    const modernDir = path.join(brandDir, LOGO_FOLDER_BY_VARIANT.modern);
    const classicDir = path.join(brandDir, LOGO_FOLDER_BY_VARIANT.classic);
    const modernOnly = Object.values(WORDMARK_FILES_BY_VARIANT.modern);

    test.each([...new Set(modernOnly)])("%s differs from classic", (name) => {
      const classicTwin = path.join(classicDir, name);
      if (!fs.existsSync(classicTwin)) return;
      expect(
        fs
          .readFileSync(path.join(modernDir, name))
          .equals(fs.readFileSync(classicTwin)),
        `modern-logo/${name} is byte-identical to classic-logo/${name}`,
      ).toBe(false);
    });
  });

  describe("manifest files", () => {
    test("manifest.json should exist for modern variant", () => {
      const manifestPath = path.join(publicDir, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    test("manifest-classic.json should exist for classic variant", () => {
      const manifestPath = path.join(publicDir, "manifest-classic.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
    });
  });
});
