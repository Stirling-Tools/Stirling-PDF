// Generic before/after capturer. NOT app-specific: it walks a targets.json that
// the ui-before-after skill generates from the branch/PR diff, so nothing here is
// hand-listed. Copy to src/core/tests/stubbed/ui-before-after.spec.ts, then run
// once per (side, theme):
//   PR_SHOT_SIDE=after  PR_SHOT_THEME=light \
//     npx playwright test --project=stubbed ui-before-after.spec.ts
//
// targets.json shape: [{ "id":"compress", "url":"/compress", "name":"Compress",
//                        "needsFile": true }]
import { test } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SIDE = process.env.PR_SHOT_SIDE ?? "after";
const THEME = process.env.PR_SHOT_THEME ?? "light";
// Capture the full viewport by default so the affected region is in frame
// wherever it is; diff-shots.mjs crops each comparison to what actually changed.
// Set PR_SHOT_SCOPE to a selector to narrow the capture to one container.
const SCOPE = process.env.PR_SHOT_SCOPE ?? "";
const ROOT = path.resolve(process.cwd(), "screenshots", "ui-diff");
const OUT = path.join(ROOT, SIDE);
// A tiny sample PDF so file-dependent tool panels render. Point at a real fixture.
const SAMPLE_PDF = process.env.PR_SHOT_SAMPLE ?? "src/core/tests/test-fixtures/sample.pdf";

type Target = { id: string; url: string; name?: string; needsFile?: boolean };
const targets: Target[] = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf-8"));

test.use({ autoGoto: false, viewport: { width: 1600, height: 900 }, seedJwt: true });

async function applyTheme(page: Page): Promise<void> {
  if (THEME !== "dark") return;
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function seedFile(page: Page): Promise<void> {
  if (!fs.existsSync(SAMPLE_PDF)) return;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("files-button").click().catch(() => {});
  await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_PDF).catch(() => {});
  await page.locator(".file-sidebar-file-item").first().isVisible({ timeout: 8_000 }).catch(() => {});
}

for (const t of targets) {
  // One test per target so a single failure doesn't drop the rest.
  test(`${SIDE}/${THEME} ${t.id}`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await applyTheme(page);
    if (t.needsFile !== false) await seedFile(page);
    await page.goto(t.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400); // settle Mantine portals/transitions
    const shot = path.join(OUT, `${t.id}__${THEME}.png`);
    if (SCOPE) {
      const scope = page.locator(SCOPE).first();
      if (await scope.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await scope.screenshot({ path: shot });
        return;
      }
    }
    // Full viewport (fixed size → stable dimensions for pixel diffing).
    await page.screenshot({ path: shot });
  });
}
