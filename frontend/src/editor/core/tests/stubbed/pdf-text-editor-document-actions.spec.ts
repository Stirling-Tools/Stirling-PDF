import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  openAdvancedSettings,
  openInTextEditor,
} from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";

// Font, colour and lock changes made across the whole document from the
// side panel: each previews on the page, Done keeps it as one undo step,
// Cancel puts the document back, and locked text is left alone.
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../../public/samples/Sample.pdf",
);

interface RunView {
  id: string;
  fontId: string;
  fill: string;
  locked: boolean;
}

type StoreWindow = {
  __editor_store: {
    doc: {
      page: (i: number) => {
        runs: {
          id: string;
          fontId: string;
          fill: { r: number; g: number; b: number };
          locked: boolean;
        }[];
      };
    };
    selection: {
      selectOne: (id: string) => void;
      selectMany: (
        runIds: string[],
        additive: boolean,
        imageIds: string[],
      ) => void;
      value: { runIds: string[] };
    };
  };
};

function runs(page: Page): Promise<RunView[]> {
  return page.evaluate(() =>
    (window as unknown as StoreWindow).__editor_store.doc
      .page(0)
      .runs.map((r) => ({
        id: r.id,
        fontId: r.fontId,
        fill: `${r.fill.r},${r.fill.g},${r.fill.b}`,
        locked: r.locked,
      })),
  );
}

async function open(page: Page): Promise<void> {
  await openInTextEditor(page, SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  // Fonts and colours are changed from the panel's Advanced section.
  await openAdvancedSettings(page);
}

async function pickFont(page: Page, name: RegExp): Promise<void> {
  const panel = page.getByTestId("pdf-editor-font-change-panel");
  await panel.getByTestId("pdf-editor-font-family").click();
  await page.getByRole("option", { name }).first().click();
}

const allCourier = (list: RunView[]) =>
  list.every((r) => r.fontId.startsWith("base14:Courier"));

test.describe("PDF text editor - document-wide changes", () => {
  test("Change all fonts previews, and Done keeps it as one undo step", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    const before = await runs(page);

    await page.getByTestId("pdf-editor-all-fonts").click();
    await pickFont(page, /^Courier/);
    await expect.poll(async () => allCourier(await runs(page))).toBe(true);

    await page.getByTestId("pdf-editor-font-change-done").click();
    await expect(page.getByTestId("pdf-editor-font-change-panel")).toHaveCount(
      0,
    );
    expect(allCourier(await runs(page))).toBe(true);

    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await runs(page)).map((r) => r.fontId))
      .toEqual(before.map((r) => r.fontId));
  });

  test("Cancel puts the fonts back", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const before = await runs(page);

    await page.getByTestId("pdf-editor-all-fonts").click();
    await pickFont(page, /^Courier/);
    await expect.poll(async () => allCourier(await runs(page))).toBe(true);

    await page.getByTestId("pdf-editor-font-change-cancel").click();
    await expect
      .poll(async () => (await runs(page)).map((r) => r.fontId))
      .toEqual(before.map((r) => r.fontId));
  });

  test("the page cannot be edited while a change is previewing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    const first = (await runs(page))[0];

    await page.getByTestId("pdf-editor-all-fonts").click();
    await expect(
      page.getByTestId("pdf-editor-font-change-panel"),
    ).toBeVisible();
    await page.getByTestId(`pdf-editor-run-${first.id}`).click({ force: true });
    const selected = await page.evaluate(
      () =>
        (window as unknown as StoreWindow).__editor_store.selection.value.runIds
          .length,
    );
    expect(selected, "a click reached the page through the popover").toBe(0);
  });

  test("a swatch recolours only the text in its colour", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const before = await runs(page);
    const swatch = page.locator('[data-testid^="pdf-editor-colour-"]').first();
    const hex = (await swatch.getAttribute("data-testid"))!.replace(
      "pdf-editor-colour-",
      "",
    );
    const toFill = (h: string) =>
      [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
    const isHex = (fill: string) => fill === toFill(hex);
    expect(before.some((r) => isHex(r.fill))).toBe(true);

    await swatch.click();
    const panel = page.getByTestId("pdf-editor-colour-change-panel");
    const sat = panel.locator(".mantine-ColorPicker-saturation");
    const box = (await sat.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect(
      page.getByTestId("pdf-editor-colour-change-done"),
    ).toBeEnabled();
    await page.getByTestId("pdf-editor-colour-change-done").click();

    const after = await runs(page);
    for (const [i, run] of before.entries()) {
      if (isHex(run.fill)) expect(after[i].fill).not.toBe(run.fill);
      else expect(after[i].fill).toBe(run.fill);
    }
  });

  test("locked text is left alone, then Unlock all frees it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page);
    const target = (await runs(page))[0];

    await page.evaluate(
      (id) =>
        (window as unknown as StoreWindow).__editor_store.selection.selectOne(
          id,
        ),
      target.id,
    );
    await page.getByTestId("pdf-editor-toggle-lock").first().click();
    await page.evaluate(() =>
      (window as unknown as StoreWindow).__editor_store.selection.selectMany(
        [],
        false,
        [],
      ),
    );
    await expect(page.getByTestId("pdf-editor-document-locked")).toBeVisible();

    await page.getByTestId("pdf-editor-all-fonts").click();
    await pickFont(page, /^Courier/);
    await expect
      .poll(async () =>
        (await runs(page))
          .filter((r) => r.id !== target.id)
          .every((r) => r.fontId.startsWith("base14:Courier")),
      )
      .toBe(true);
    await page.getByTestId("pdf-editor-font-change-done").click();
    const locked = (await runs(page)).find((r) => r.id === target.id)!;
    expect(locked.fontId).toBe(target.fontId);

    await page.getByTestId("pdf-editor-unlock-all").click();
    await expect(page.getByTestId("pdf-editor-document-locked")).toHaveCount(0);
    expect((await runs(page)).find((r) => r.id === target.id)!.locked).toBe(
      false,
    );
  });
});
