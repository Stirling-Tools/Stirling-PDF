import { describe, expect, test } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests that all required logo assets exist in the `logo` folder.
 * This ensures that when useLogoAssets returns paths, those files actually exist.
 */
describe("useLogoAssets - Logo Asset Files", () => {
  const publicDir = path.resolve(__dirname, "../../../public");

  // All asset files that useLogoAssets references
  const requiredAssets = [
    "logo-tooltip.svg",
    "Firstpage.png",
    "favicon.ico",
    "logo192.png",
    "logo512.png",
    "StirlingPDFLogoWhiteText.svg",
    "StirlingPDFLogoBlackText.svg",
    "StirlingPDFLogoGreyText.svg",
  ];

  const folderPath = path.join(publicDir, "logo");

  test('folder "logo" should exist', () => {
    expect(fs.existsSync(folderPath)).toBe(true);
  });

  test.each(requiredAssets)("should have %s", (assetName) => {
    const assetPath = path.join(folderPath, assetName);
    expect(fs.existsSync(assetPath), `Missing asset: logo/${assetName}`).toBe(
      true,
    );
  });

  test("manifest.json should exist", () => {
    const manifestPath = path.join(publicDir, "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
  });
});
