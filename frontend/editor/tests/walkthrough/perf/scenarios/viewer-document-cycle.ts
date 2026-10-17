/**
 * Viewer document cycle: open a document in the viewer, look at it, close it.
 *
 * This is the "close a document, then do it again" cycle: the file lives in
 * the library once, and each cycle mounts and unmounts the viewer for it. Both
 * the open and the close happen inside the app (the sidebar eye toggles the
 * viewer's workbench), so nothing here navigates and the baseline sample and
 * the closing sample belong to the same document. That matters: a reload
 * cannot retain heap, so a cycle that navigates answers no retention question.
 *
 * Readiness is the app's own viewer surface, `.pdf-viewer-toolbar-dock`, which
 * mounts with the document and unmounts with it — never a clock. Uploading a
 * file opens it, so the cycle first puts the app back into the library-only
 * state and then opens the document itself, which makes every cycle identical.
 */
import { basename, resolve } from "node:path";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assertSerializable } from "../serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { Scenario, ScenarioPage } from "../types";

const DOCUMENT =
  process.env.WALKTHROUGH_FIXTURE ??
  resolve(
    import.meta.dirname,
    "../../../../src/core/tests/test-fixtures/user-sample.pdf",
  );

const FILE_ITEM = ".file-sidebar-file-item";
const EYE = `${FILE_ITEM} .file-sidebar-eye-btn`;
const VIEWER = ".pdf-viewer-toolbar-dock";

/** Adds the fixture to the library if this run is the one that uploads it. */
async function ensureFixtureInLibrary(page: ScenarioPage): Promise<void> {
  if ((await page.locator(FILE_ITEM).first().count()) > 0) return;

  const inputVisible = await page
    .getByTestId("file-input")
    .first()
    .isVisible()
    .catch(() => false);
  if (!inputVisible) {
    await page.getByTestId("files-button").first().click({ timeout: 15_000 });
  }
  await page.getByTestId("file-input").first().setInputFiles(DOCUMENT);
  await page.locator(FILE_ITEM).first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

export const viewerDocumentCycle: Scenario = {
  id: "viewer-document-cycle",
  name: "Editor · open a document in the viewer and close it again",
  platform: "desktop-web",
  fixture: `${basename(DOCUMENT)} in the library, stubbed API`,
  route: "/editor",
  async use(page: ScenarioPage): Promise<string> {
    await ensureFixtureInLibrary(page);

    // An upload opens its file, so a cycle starts closed: the eye sits under
    // the row's pointer-events rule and Playwright's own hover is what makes
    // it clickable, so do not reach for a synthetic event here.
    const opened = page.locator(VIEWER).first();
    if (await opened.isVisible().catch(() => false)) {
      await page.locator(EYE).first().click({ timeout: 15_000 });
      await page.locator(VIEWER).first().waitFor({
        state: "hidden",
        timeout: 20_000,
      });
    }

    await page.locator(EYE).first().click({ timeout: 15_000 });
    await page.locator(VIEWER).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
    // The document body is what the viewer cost; wait for it, not for the dock
    // alone, so the cycle measures a document that actually mounted.
    await page.waitForFunction(
      assertSerializable(() => document.querySelectorAll("iframe").length > 0),
      null,
      { timeout: 30_000 },
    );

    await page.locator(EYE).first().click({ timeout: 15_000 });
    await page.locator(VIEWER).first().waitFor({
      state: "hidden",
      timeout: 20_000,
    });
    await page.waitForFunction(
      assertSerializable(() => document.querySelectorAll("iframe").length === 0),
      null,
      { timeout: 20_000 },
    );

    return "opened a document in the viewer, mounted its page, closed it";
  },
};

export const BUILTIN_SCENARIOS = [viewerDocumentCycle];
