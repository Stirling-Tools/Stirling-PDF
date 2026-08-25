import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * TEMPORARY capture spec for the Auto Form Detection UI review.
 * Dumps PNGs of every tool/admin state into SHOT_DIR (env). Not for CI.
 */

test.skip(!!process.env.CI, "capture-only spec; not for CI");

const SHOT_DIR =
  process.env.SHOT_DIR ??
  path.join(import.meta.dirname, "../../../../screenshots/ui-review");

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

function shot(name: string): string {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

const CATALOG = [
  {
    id: "ffdnet-s",
    displayName: "CommonForms FFDNet-S (Small)",
    description:
      "Small, fast detector with lower memory use - a good default for most forms. Finds text inputs, checkboxes, and signature fields.",
    license:
      "CommonForms dataset CC-BY-4.0; Ultralytics-YOLO lineage AGPL-3.0. Downloaded on demand, never bundled.",
    sizeBytes: 38370092,
    onnxUrl:
      "https://huggingface.co/jbarrow/FFDNet-S-cpu/resolve/main/FFDNet-S.onnx",
    sha256: "93bccf47c048f9f947f9b1b52d002edf144a8a583dae39f164d9e5725321acc0",
    inputSize: 1216,
    classNames: ["text", "choice", "signature"],
    classFieldTypes: ["text", "checkbox", "signature"],
    scoreThreshold: 0.3,
  },
  {
    id: "ffdnet-l",
    displayName: "CommonForms FFDNet-L (Large)",
    description:
      "Larger, higher-accuracy detector (~25M parameters) with better recall on dense or complex forms - uses more memory. Finds text inputs, checkboxes, and signature fields.",
    license:
      "CommonForms dataset CC-BY-4.0; Ultralytics-YOLO lineage AGPL-3.0. Downloaded on demand, never bundled.",
    sizeBytes: 101944542,
    onnxUrl:
      "https://huggingface.co/jbarrow/FFDNet-L-cpu/resolve/main/FFDNet-L.onnx",
    sha256: "e00c59edd9a5275dab5847d38f042c8ecc827063650c8aac22b0e486c414cd35",
    inputSize: 1216,
    classNames: ["text", "choice", "signature"],
    classFieldTypes: ["text", "checkbox", "signature"],
    scoreThreshold: 0.3,
  },
];

type StatusOverrides = Record<string, unknown>;

function modelStatus(overrides: StatusOverrides = {}) {
  return {
    status: "ready",
    progress: 100,
    activeModelId: "ffdnet-s",
    installed: ["ffdnet-s"],
    error: null,
    writable: true,
    catalog: CATALOG,
    enabled: true,
    executionMode: "auto",
    serverEngineAvailable: true,
    ...overrides,
  };
}

async function stubStatus(page: Page, overrides: StatusOverrides = {}) {
  await page.route("**/api/v1/form/form-detection-model/status", (r: Route) =>
    r.fulfill({ json: modelStatus(overrides) }),
  );
}

/**
 * Stub the server detect endpoint. The tool now posts applyToPdf=false and expects
 * JSON detections (client-side apply); return a realistic field set so the summary
 * panel and the pdf-lib apply path exercise for real. Falls back to the PDF blob
 * shape if the request asked for applyToPdf=true.
 */
async function stubDetect(page: Page, delayMs = 0) {
  const pdf = fs.readFileSync(SAMPLE_PDF);
  const detections = [
    // page 0: text rows + checkboxes + a signature
    ...[0, 1, 2, 3, 4].map((i) => ({
      type: "text",
      page: 0,
      rectInPdfPoints: { x: 90, y: 620 - i * 40, w: 220, h: 22 },
      confidence: 0.92 - i * 0.05,
    })),
    ...[0, 1, 2].map((i) => ({
      type: "checkbox",
      page: 0,
      rectInPdfPoints: { x: 90, y: 420 - i * 30, w: 16, h: 16 },
      confidence: 0.88 - i * 0.06,
    })),
    ...[0, 1, 2].map((i) => ({
      type: "text",
      page: 1,
      rectInPdfPoints: { x: 90, y: 600 - i * 40, w: 220, h: 22 },
      confidence: 0.8 - i * 0.05,
    })),
    {
      type: "signature",
      page: 1,
      rectInPdfPoints: { x: 90, y: 160, w: 220, h: 48 },
      confidence: 0.74,
    },
  ];
  await page.route("**/api/v1/form/form-detection/detect", async (r: Route) => {
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
    const body = r.request().postData() ?? "";
    if (body.includes("applyToPdf") && body.includes("true")) {
      await r.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: pdf,
      });
    } else {
      await r.fulfill({ json: { detections } });
    }
  });
}

async function uploadSample(page: Page) {
  await uploadFiles(page, SAMPLE_PDF);
}

async function settle(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

async function darkMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

const panel = (page: Page) => page.locator('[data-tour="tool-panel"]');

test.use({ autoGoto: false });

/* ─── Tool surface ─────────────────────────────────────────────────── */

test("tool-01-home-tile", async ({ page }) => {
  await stubStatus(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tile = page
    .locator('[data-tour="tool-button-autoFormDetection"]')
    .first();
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await tile.scrollIntoViewIfNeeded();
  await settle(page);
  await panel(page).screenshot({ path: shot("tool-01-home-tile") });
  await tile.screenshot({ path: shot("tool-01b-tile-closeup") });
});

test("tool-02-panel-empty", async ({ page }) => {
  await stubStatus(page);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await settle(page);
  await panel(page).screenshot({ path: shot("tool-02-panel-empty") });
});

test("tool-03-panel-file", async ({ page }) => {
  await stubStatus(page);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await uploadSample(page);
  await settle(page);
  await panel(page).screenshot({ path: shot("tool-03-panel-file") });
  await page.screenshot({ path: shot("tool-03b-full-page") });
});

test("tool-04-running", async ({ page }) => {
  // No active model -> server path; slow response so the loading state is visible.
  await stubStatus(page, { status: "ready", activeModelId: "", installed: [] });
  await stubDetect(page, 15_000);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await uploadSample(page);
  await page.locator('[data-tour="run-button"]').click();
  await page.waitForTimeout(2_500);
  await panel(page).screenshot({ path: shot("tool-04-running") });
});

test("tool-05-results", async ({ page }) => {
  await stubStatus(page, { status: "ready", activeModelId: "", installed: [] });
  await stubDetect(page);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await uploadSample(page);
  await page.locator('[data-tour="run-button"]').click();
  await expect(
    page
      .getByText(
        /Detection results|Review fillable|Detected Form Fields|Review/i,
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await settle(page, 1_200);
  await panel(page).screenshot({ path: shot("tool-05-results") });
});

test("tool-06-endpoint-disabled", async ({ page }) => {
  await stubStatus(page, {
    status: "not_installed",
    activeModelId: "",
    installed: [],
  });
  const disabledMap = {
    "form-detection": { enabled: false, reason: "DEPENDENCY" },
  };
  await page.route("**/api/v1/config/endpoints-availability", (r: Route) =>
    r.fulfill({ json: disabledMap }),
  );
  await page.route("**/api/v1/config/endpoints-enabled", (r: Route) =>
    r.fulfill({ json: disabledMap }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tile = page
    .locator('[data-tour="tool-button-autoFormDetection"]')
    .first();
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await tile.scrollIntoViewIfNeeded();
  await settle(page);
  await tile.hover();
  await expect(
    page
      .getByText(/Needs the AI detection model|missing on server|Unavailable/i)
      .first(),
  ).toBeVisible({ timeout: 5_000 });
  await settle(page, 400);
  const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
  await page.screenshot({
    path: shot("tool-06-endpoint-disabled"),
    clip: { x: vp.width - 1150, y: 0, width: 1150, height: 700 },
  });
});

test("tool-07-dark-panel-file", async ({ page }) => {
  await darkMode(page);
  await stubStatus(page);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await uploadSample(page);
  await settle(page);
  await panel(page).screenshot({ path: shot("tool-07-dark-panel-file") });
});

test("tool-08-dark-results", async ({ page }) => {
  await darkMode(page);
  await stubStatus(page, { status: "ready", activeModelId: "", installed: [] });
  await stubDetect(page);
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
  await uploadSample(page);
  await page.locator('[data-tour="run-button"]').click();
  await expect(
    page
      .getByText(
        /Detection results|Review fillable|Detected Form Fields|Review/i,
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await settle(page, 1_200);
  await panel(page).screenshot({ path: shot("tool-08-dark-results") });
});

/* ─── Admin surface ────────────────────────────────────────────────── */

const adminUse = {
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "admin",
      email: "admin@example.com",
      roles: ["ROLE_ADMIN"],
    },
  },
  seedJwt: true,
  autoGoto: false as const,
};

async function openFormDetectionSettings(page: Page) {
  await page.route("**/api/v1/proprietary/ui-data/account", (r: Route) =>
    r.fulfill({
      json: { username: "admin", email: "admin@example.com", isAdmin: true },
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const configBtn = page.locator('[data-testid="config-button"]').first();
  await expect(configBtn).toBeVisible({ timeout: 15_000 });
  await configBtn.click();
  const dialog = page.locator(".mantine-Modal-content").first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByText("Features", { exact: true }).first().click();
  await expect(dialog.getByText(/AI Form Detection/i).first()).toBeVisible({
    timeout: 5_000,
  });
  // The form-detection card is the Paper containing the title text.
  const card = dialog
    .locator("div")
    .filter({ has: page.getByText(/AI Form Detection/i) });
  return { dialog, card };
}

/** Screenshot the settings card (ancestor Paper of the section title). */
async function shootCard(
  page: Page,
  dialog: ReturnType<Page["locator"]>,
  name: string,
) {
  const paper = dialog
    .locator(".mantine-Paper-root")
    .filter({ hasText: "AI Form Detection" })
    .last();
  await paper.scrollIntoViewIfNeeded();
  await settle(page);
  await paper.screenshot({ path: shot(name) });
}

test.describe("admin", () => {
  test.use(adminUse);

  test("admin-01-ready", async ({ page }) => {
    await stubStatus(page);
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-01-ready");
    await dialog.screenshot({ path: shot("admin-01b-dialog") });
  });

  test("admin-02-not-installed", async ({ page }) => {
    await stubStatus(page, {
      status: "not_installed",
      activeModelId: "",
      installed: [],
      progress: 0,
    });
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-02-not-installed");
  });

  test("admin-03-downloading", async ({ page }) => {
    await stubStatus(page, {
      status: "downloading",
      activeModelId: "",
      installed: [],
      progress: 42,
      downloadingModelId: "ffdnet-s",
    });
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-03-downloading");
  });

  test("admin-04-airgap-open", async ({ page }) => {
    // The expanded instructions run ~1400px tall; a taller viewport keeps the
    // modal scrollport from clipping the element screenshot.
    await page.setViewportSize({ width: 1920, height: 1900 });
    await stubStatus(page);
    const { dialog } = await openFormDetectionSettings(page);
    const toggle = dialog.getByText(/Air-gapped|offline install/i).first();
    if (await toggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await toggle.click();
      await settle(page);
    }
    // The expanded card is taller than the modal scrollport; shoot the section itself.
    const section = dialog.locator(".sui-collapsible").first();
    if (await section.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await section.scrollIntoViewIfNeeded();
      await settle(page);
      await section.screenshot({ path: shot("admin-04-airgap-open") });
    } else {
      await shootCard(page, dialog, "admin-04-airgap-open");
    }
  });

  test("admin-05-server-unavailable", async ({ page }) => {
    await stubStatus(page, {
      serverEngineAvailable: false,
      executionMode: "auto",
    });
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-05-server-unavailable");
  });

  test("admin-06-failed", async ({ page }) => {
    await stubStatus(page, {
      status: "failed",
      activeModelId: "",
      installed: [],
      error: "Model checksum mismatch (expected 93bccf..., got a1b2c3...)",
    });
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-06-failed");
  });

  test("admin-07-dark-ready", async ({ page }) => {
    await darkMode(page);
    await stubStatus(page);
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-07-dark-ready");
  });

  test("admin-08-two-installed", async ({ page }) => {
    await stubStatus(page, { installed: ["ffdnet-s", "ffdnet-l"] });
    const { dialog } = await openFormDetectionSettings(page);
    await shootCard(page, dialog, "admin-08-two-installed");
  });
});
