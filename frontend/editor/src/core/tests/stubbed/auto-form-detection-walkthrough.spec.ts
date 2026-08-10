import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/** Walkthrough capture for the Auto Form Detection feature. Not for CI. */

const SHOT_DIR =
  process.env.SHOT_DIR ??
  path.join(import.meta.dirname, "../../../../screenshots/auto-form-detection");

const SAMPLE_PDF = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

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

function modelStatus(overrides: Record<string, unknown> = {}) {
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
    downloadingModelId: null,
    ...overrides,
  };
}

async function stubStatus(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route("**/api/v1/ai/form-detection-model/status", (r: Route) =>
    r.fulfill({ json: modelStatus(overrides) }),
  );
}

const DETECTIONS = [
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

async function stubDetect(
  page: Page,
  opts: { delayMs?: number; detections?: unknown[] } = {},
) {
  const pdf = fs.readFileSync(SAMPLE_PDF);
  const detections = opts.detections ?? DETECTIONS;
  await page.route("**/api/v1/ai/form-detection/detect", async (r: Route) => {
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
    const body = r.request().postData() ?? "";
    if (body.includes("applyToPdf") && body.includes("true")) {
      await r.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
    } else {
      await r.fulfill({ json: { detections } });
    }
  });
}

async function settle(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

type Theme = "light" | "dark";

async function applyTheme(page: Page, theme: Theme) {
  if (theme !== "dark") return;
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("i18nextLng-source", "3");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

const panel = (page: Page) => page.locator('[data-tour="tool-panel"]');

async function gotoTool(page: Page) {
  await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 15_000,
  });
}

async function runToResults(page: Page) {
  await uploadFiles(page, SAMPLE_PDF);
  await page.locator('[data-tour="run-button"]').click();
  await expect(
    page.getByText(/Detection results|Review fillable/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await settle(page, 1_200);
}

test.use({ autoGoto: false });

const THEMES: Theme[] = ["light", "dark"];

for (const theme of THEMES) {
  test(`01_tool_tile_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const tile = page
      .locator('[data-tour="tool-button-autoFormDetection"]')
      .first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.scrollIntoViewIfNeeded();
    await settle(page);
    await panel(page).screenshot({ path: shot(`01_tool_tile_${theme}`) });
  });

  test(`02_panel_empty_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page);
    await gotoTool(page);
    await settle(page);
    await panel(page).screenshot({ path: shot(`02_panel_empty_${theme}`) });
  });

  test(`03_panel_settings_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page);
    await gotoTool(page);
    await uploadFiles(page, SAMPLE_PDF);
    await settle(page);
    await panel(page).screenshot({ path: shot(`03_panel_settings_${theme}`) });
  });

  test(`04_running_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page, { activeModelId: "", installed: [] });
    await stubDetect(page, { delayMs: 15_000 });
    await gotoTool(page);
    await uploadFiles(page, SAMPLE_PDF);
    await page.locator('[data-tour="run-button"]').click();
    await page.waitForTimeout(2_500);
    await panel(page).screenshot({ path: shot(`04_running_${theme}`) });
  });

  test(`05_results_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page, { activeModelId: "", installed: [] });
    await stubDetect(page);
    await gotoTool(page);
    await runToResults(page);
    await panel(page).screenshot({ path: shot(`05_results_${theme}`) });
  });

  test(`06_results_empty_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
    await stubStatus(page, { activeModelId: "", installed: [] });
    await stubDetect(page, { detections: [] });
    await gotoTool(page);
    await uploadFiles(page, SAMPLE_PDF);
    await page.locator('[data-tour="run-button"]').click();
    await expect(
      page.getByText(/No form fields found|Review fillable/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await settle(page, 1_200);
    await panel(page).screenshot({ path: shot(`06_results_empty_${theme}`) });
  });

  test(`07_tile_disabled_${theme}`, async ({ page }) => {
    await applyTheme(page, theme);
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
      page.getByText(/Needs the AI detection model/i).first(),
    ).toBeVisible({ timeout: 5_000 });
    await settle(page, 400);
    const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
    await page.screenshot({
      path: shot(`07_tile_disabled_${theme}`),
      clip: { x: vp.width - 1150, y: 0, width: 1150, height: 700 },
    });
  });
}

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
  await dialog
    .getByText(/^(Features|الميزات)$/)
    .first()
    .click();
  await expect(dialog.getByText(/AI Form Detection/i).first()).toBeVisible({
    timeout: 5_000,
  });
  return dialog;
}

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

  for (const theme of THEMES) {
    test(`08_admin_ready_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page);
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `08_admin_ready_${theme}`);
    });

    test(`09_admin_not_installed_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page, {
        status: "not_installed",
        activeModelId: "",
        installed: [],
        progress: 0,
      });
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `09_admin_not_installed_${theme}`);
    });

    test(`10_admin_downloading_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page, {
        status: "downloading",
        activeModelId: "",
        installed: [],
        progress: 42,
        downloadingModelId: "ffdnet-s",
      });
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `10_admin_downloading_${theme}`);
    });

    test(`11_admin_failed_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page, {
        status: "failed",
        activeModelId: "",
        installed: [],
        error: "Model checksum mismatch (expected 93bccf..., got a1b2c3...)",
      });
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `11_admin_failed_${theme}`);
    });

    test(`12_admin_two_installed_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page, { installed: ["ffdnet-s", "ffdnet-l"] });
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `12_admin_two_installed_${theme}`);
    });

    test(`13_admin_airgap_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page);
      const dialog = await openFormDetectionSettings(page);
      const toggle = dialog.getByText(/Offline \/ air-gapped install/i).first();
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await settle(page);
      const section = dialog.locator(".sui-collapsible").first();
      await section.scrollIntoViewIfNeeded();
      await settle(page);
      await section.screenshot({ path: shot(`13_admin_airgap_${theme}`) });
    });

    test(`14_admin_server_unavailable_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await stubStatus(page, { serverEngineAvailable: false });
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `14_admin_server_unavailable_${theme}`);
    });
  }
});

test.describe("rtl tool", () => {
  test.use({ stubOptions: { languages: ["en-US", "ar-AR"] } });

  for (const theme of THEMES) {
    test(`15_rtl_panel_settings_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await enableRtl(page);
      await stubStatus(page);
      await page.goto("/auto-form-detection", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
        timeout: 15_000,
      });
      await uploadFiles(page, SAMPLE_PDF);
      await settle(page);
      await panel(page).screenshot({
        path: shot(`15_rtl_panel_settings_${theme}`),
      });
    });
  }
});

test.describe("rtl admin", () => {
  test.use({
    ...adminUse,
    stubOptions: {
      ...adminUse.stubOptions,
      languages: ["en-US", "ar-AR"],
    },
  });

  for (const theme of THEMES) {
    test(`16_rtl_admin_ready_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await enableRtl(page);
      await stubStatus(page);
      const dialog = await openFormDetectionSettings(page);
      await shootCard(page, dialog, `16_rtl_admin_ready_${theme}`);
    });
  }
});
