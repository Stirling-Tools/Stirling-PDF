import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Smoke test: verify every tool page loads without crashing,
 * including sub-modes for tools that have them (Split methods,
 * Redact modes, Watermark types, CertSign modes, etc.).
 *
 * This is a Chromium-only smoke test — fast and reliable.
 */

// ─── URL helper ──────────────────────────────────────────────────────────────

/** Convert camelCase toolId to URL path, matching getToolUrlPath() in toolsTaxonomy.ts */
function toUrlPath(toolId: string): string {
  return `/${toolId.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

// ─── Tool IDs ────────────────────────────────────────────────────────────────

// Mirror of CORE_REGULAR_TOOL_IDS + CORE_SUPER_TOOL_IDS from toolId.ts
// Link tools (devApi, devFolderScanning, etc.) are excluded — they redirect externally.
const TOOL_IDS = [
  // Regular tools
  "certSign",
  "sign",
  "addText",
  "addPassword",
  "removePassword",
  "removePages",
  "removeBlanks",
  "removeAnnotations",
  "removeImage",
  "changePermissions",
  "watermark",
  "sanitize",
  "split",
  "merge",
  "convert",
  "ocr",
  "addImage",
  "rotate",
  "annotate",
  "scannerImageSplit",
  "editTableOfContents",
  "scannerEffect",
  "autoRename",
  "pageLayout",
  "scalePages",
  "adjustContrast",
  "crop",
  "pdfToSinglePage",
  "repair",
  "compare",
  "addPageNumbers",
  "redact",
  "flatten",
  "removeCertSign",
  "unlockPDFForms",
  "compress",
  "extractPages",
  "reorganizePages",
  "extractImages",
  "addStamp",
  "addAttachments",
  "changeMetadata",
  "overlayPdfs",
  "getPdfInfo",
  "validateSignature",
  "timestampPdf",
  "replaceColor",
  "showJS",
  "bookletImposition",
  "pdfTextEditor",
  "formFill",
  // Super tools
  "multiTool",
  "read",
  "automate",
] as const;

// ─── Sub-mode definitions for tools with multiple methods/modes ──────────────

// CertSign tool: two modes selected via ButtonSelector
const CERT_SIGN_MODES = ["auto", "manual"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Navigate to a tool page and verify it loaded (didn't crash / redirect to login) */
async function verifyToolPageLoads(
  page: import("@playwright/test").Page,
  urlPath: string,
) {
  // waitUntil: 'domcontentloaded' avoids hanging on third-party CDN resources
  // (iconify, posthog, stripe) the stub doesn't mock — the default 'load'
  // event waits for ALL subresources, which can time out on slow runners.
  await page.goto(urlPath, { waitUntil: "domcontentloaded" });

  // Page should not show an unhandled error / white screen
  await expect(page.locator("body").first()).not.toBeEmpty();

  // Should not have been kicked back to login
  const url = page.url();
  expect(url.includes(urlPath) || url.endsWith("/")).toBeTruthy();
}

// ─── Tests: every tool page loads ────────────────────────────────────────────

test.describe("Smoke: All tool pages load", () => {
  for (const toolId of TOOL_IDS) {
    const urlPath = toUrlPath(toolId);

    test(`tool page loads: ${toolId} (${urlPath})`, async ({ page }) => {
      await verifyToolPageLoads(page, urlPath);
    });
  }
});

// ─── Tests: tools with sub-modes ─────────────────────────────────────────────

test.describe("Smoke: Tool sub-modes load", () => {
  // ── Split: click each available method card ─────────────────────────
  // Disabled endpoints remove cards entirely (shifting indices), so we
  // simply click every visible card rather than matching by index.
  test("split: all available method cards load", async ({ page }) => {
    test.setTimeout(120_000); // 8 cards × ~10s each
    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");

    const cards = page.locator(".mantine-Card-root");
    // Wait for at least one card to appear (may be zero if all endpoints off)
    const firstVisible = await cards
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!firstVisible) return; // all split endpoints disabled — nothing to test

    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      // Re-navigate for each card — clicking a card collapses the selector
      if (i > 0) {
        await page.goto("/split");
        await page.waitForLoadState("domcontentloaded");
      }

      const card = cards.nth(i);
      await card.click();

      // After clicking, the settings step should appear and page shouldn't crash
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(/\/split/);
      await expect(page.locator("body").first()).not.toBeEmpty();
    }
  });

  // ── Watermark: click each available type card ───────────────────────
  test("watermark: all available type cards load", async ({ page }) => {
    await page.goto("/watermark");
    await page.waitForLoadState("domcontentloaded");

    const cards = page.locator(".mantine-Card-root");
    const firstVisible = await cards
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!firstVisible) return;

    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await page.goto("/watermark");
        await page.waitForLoadState("domcontentloaded");
      }

      await cards.nth(i).click();
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(/\/watermark/);
      await expect(page.locator("body").first()).not.toBeEmpty();
    }
  });

  // ── CertSign: click Auto / Manual mode buttons ─────────────────────────
  test.describe("CertSign modes", () => {
    for (const mode of CERT_SIGN_MODES) {
      test(`certSign sub-mode: ${mode}`, async ({ page }) => {
        await page.goto("/cert-sign");
        await page.waitForLoadState("domcontentloaded");

        // ButtonSelector renders Mantine <Button disabled> — check both visible AND enabled
        const label = mode === "auto" ? /auto/i : /manual/i;
        const btn = page.getByRole("button", { name: label }).first();
        const visible = await btn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        if (!visible) return; // tool not rendered (endpoint entirely off)

        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) return; // button rendered but disabled

        await btn.click();
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(/\/cert-sign/);
        await expect(page.locator("body").first()).not.toBeEmpty();
      });
    }
  });

  // ── Redact: click Automatic / Manual mode buttons ──────────────────────
  test.describe("Redact modes", () => {
    for (const mode of ["automatic", "manual"]) {
      test(`redact sub-mode: ${mode}`, async ({ page }) => {
        await page.goto("/redact");
        await page.waitForLoadState("domcontentloaded");

        const label = mode === "automatic" ? /automatic/i : /manual/i;
        const btn = page.getByRole("button", { name: label }).first();
        const visible = await btn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        if (!visible) return;

        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) return; // e.g. "Automatic" disabled when no files selected

        await btn.click();
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(/\/redact/);
        await expect(page.locator("body").first()).not.toBeEmpty();
      });
    }
  });

  // ── AddStamp: click Quick Position / Custom Position mode ──────────────
  test.describe("AddStamp positioning modes", () => {
    for (const mode of ["quick", "custom"]) {
      test(`addStamp sub-mode: ${mode} position`, async ({ page }) => {
        await page.goto("/add-stamp");
        await page.waitForLoadState("domcontentloaded");

        const label = mode === "quick" ? /quick/i : /custom/i;
        const btn = page.getByRole("button", { name: label }).first();
        const visible = await btn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        if (!visible) return;

        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) return;

        await btn.click();
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(/\/add-stamp/);
        await expect(page.locator("body").first()).not.toBeEmpty();
      });
    }
  });
});
