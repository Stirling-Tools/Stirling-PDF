import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// The font list names each family once; the Bold and Italic toggles move text
// between the faces that family really has, and never make one up.

const TAGGED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);
const COLOURED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/coloured-word-sample.pdf",
);

const FONTS = path.join(
  import.meta.dirname,
  "../../../../../../app/core/src/main/resources/static/fonts",
);

/** A server family with a light and a semibold face, so the weight menu shows. */
const SERVER_FAMILY = {
  family: "Demo Sans",
  faces: [
    ["Light", 300, false, "LiberationSans-Regular.ttf"],
    ["Regular", 400, false, "LiberationSans-Regular.ttf"],
    ["Semibold", 600, true, "LiberationSans-Bold.ttf"],
    ["Bold", 700, true, "LiberationSans-Bold.ttf"],
  ] as const,
};

async function serveFonts(page: Page) {
  const id = (i: number) => String(i + 1).repeat(64);
  await page.route("**/api/v1/ui-data/editor-fonts**", (route) => {
    const face = /editor-fonts\/([0-9a-f]{64})/.exec(route.request().url());
    if (!face)
      return route.fulfill({
        json: {
          families: [
            {
              family: SERVER_FAMILY.family,
              faces: SERVER_FAMILY.faces.map(([style, weight, bold], i) => ({
                id: id(i),
                style,
                weight,
                bold,
                italic: false,
                postscriptName: `DemoSans-${style}`,
              })),
            },
          ],
        },
      });
    const index = SERVER_FAMILY.faces.findIndex((_, i) => id(i) === face[1]);
    return route.fulfill({
      body: readFileSync(path.join(FONTS, SERVER_FAMILY.faces[index][3])),
      contentType: "font/ttf",
    });
  });
}

const FORMAT_CONTROLS = [
  "pdf-editor-font-family",
  "pdf-editor-font-weight",
  "pdf-editor-font-size",
  "pdf-editor-colour",
  "pdf-editor-bold",
  "pdf-editor-italic",
  "pdf-editor-change-case",
];

/** The formatting controls a user cannot see: past the toolbar's edge, or missing from the formatting menu. */
async function unreachableControls(page: Page): Promise<string[]> {
  const menu = page.getByTestId("pdf-editor-format-menu");
  if ((await menu.count()) > 0) {
    const family = page.getByTestId("pdf-editor-font-family");
    if (!(await family.isVisible())) await menu.click();
    await family.waitFor({ state: "visible" });
    const missing: string[] = [];
    for (const id of FORMAT_CONTROLS)
      if (!(await page.getByTestId(id).isVisible())) missing.push(id);
    return missing;
  }
  return page.evaluate((ids) => {
    const band = document
      .querySelector(".pdf-editor-topbar__band")!
      .getBoundingClientRect();
    return ids.filter((id) => {
      const control = document.querySelector(`[data-testid="${id}"]`);
      if (!control) return true;
      const box = control.getBoundingClientRect();
      return box.left < band.left - 0.5 || box.right > band.right + 0.5;
    });
  }, FORMAT_CONTROLS);
}

async function openEditor(page: Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect.poll(() => runs(page), { timeout: 30_000 }).not.toHaveLength(0);
}

function runs(
  page: Page,
): Promise<Array<{ id: string; text: string; fontId: string }>> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __editor_store?: {
        state: {
          pages: { runs: { id: string; text: string; fontId: string }[] }[];
        };
      };
    };
    return (w.__editor_store?.state.pages[0]?.runs ?? []).map((r) => ({
      id: r.id,
      text: r.text,
      fontId: r.fontId,
    }));
  });
}

async function runId(page: Page, text: string): Promise<string> {
  const run = (await runs(page)).find((r) => r.text.startsWith(text));
  expect(run, `no run starting "${text}"`).toBeTruthy();
  return run!.id;
}

async function fontIdOf(page: Page, id: string): Promise<string | undefined> {
  return (await runs(page)).find((r) => r.id === id)?.fontId;
}

function runBox(page: Page, id: string) {
  return page.getByTestId(`pdf-editor-run-${id}`);
}

/** Put the run in the served family, whose extra weights bring up the weight menu. */
async function pickServerFamily(page: Page, id: string) {
  await runBox(page, id).click();
  await page.getByTestId("pdf-editor-font-family").click();
  await page
    .getByRole("option", { name: SERVER_FAMILY.family, exact: true })
    .click();
  await expect.poll(() => fontIdOf(page, id)).toMatch(/Demo Sans/);
}

test.describe("PDF text editor - Bold toggle", () => {
  test("the font list names each family once and Bold picks the bold face", async ({
    page,
  }) => {
    await openEditor(page, TAGGED_PDF);
    const body = await runId(page, "Revenue grew");
    await runBox(page, body).click();

    const bold = page.getByTestId("pdf-editor-bold");
    await expect(bold).toBeEnabled();
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await expect(
      page
        .getByTestId("pdf-editor-italic")
        .locator("xpath=preceding-sibling::*[1]"),
    ).toHaveAttribute("data-testid", "pdf-editor-bold");

    await page.getByTestId("pdf-editor-font-family").click();
    await expect(
      page.getByRole("option", { name: "Helvetica", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /bold|oblique|italic/i }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("option", { name: "Helvetica", exact: true }),
    ).toBeHidden();

    await bold.click();
    await expect.poll(() => fontIdOf(page, body)).toMatch(/Helvetica-Bold$/);
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    expect((await runs(page)).find((r) => r.id === body)?.text).toMatch(
      /^Revenue grew in every region/,
    );

    await bold.click();
    await expect.poll(() => fontIdOf(page, body)).not.toMatch(/Bold/);
    await expect(bold).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("pdf-editor-undo").click();
    await expect.poll(() => fontIdOf(page, body)).toMatch(/Helvetica-Bold$/);
    await page.getByTestId("pdf-editor-redo").click();
    await expect.poll(() => fontIdOf(page, body)).not.toMatch(/Bold/);
  });

  test("a half-bold selection shows mixed and goes all bold", async ({
    page,
  }) => {
    await openEditor(page, TAGGED_PDF);
    const heading = await runId(page, "Quarterly report");
    const body = await runId(page, "Revenue grew");

    const headingFont = await fontIdOf(page, heading);

    await runBox(page, body).click();
    await runBox(page, heading).click({ modifiers: ["Shift"] });

    const bold = page.getByTestId("pdf-editor-bold");
    await expect(bold).toHaveAttribute("aria-pressed", "mixed");
    await bold.click();

    await expect.poll(() => fontIdOf(page, body)).toMatch(/Helvetica-Bold$/);
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    expect(await fontIdOf(page, heading), "already bold, left as it was").toBe(
      headingFont,
    );
  });

  test("Bold is off with a reason for a font that has no bold face", async ({
    page,
  }) => {
    await openEditor(page, COLOURED_PDF);
    await runBox(page, await runId(page, "הטלפון")).click();

    const bold = page.getByTestId("pdf-editor-bold");
    await expect(bold).toBeDisabled();
    await bold.hover();
    await expect(page.getByRole("tooltip")).toContainText(
      "No bold version of this font",
    );
  });

  test("Bold onto a subset that lacks some letters draws them in the closest match and says so", async ({
    page,
  }) => {
    await openEditor(page, COLOURED_PDF);
    const line = await runId(page, "Total due today");
    const before = await fontIdOf(page, line);
    await runBox(page, line).click();

    await page.getByTestId("pdf-editor-bold").click();

    await expect(
      page.getByText(/drawn in the closest matching font/),
    ).toBeVisible();
    await expect.poll(() => fontIdOf(page, line)).not.toBe(before);
    expect((await runs(page)).find((r) => r.id === line)?.text).toBe(
      "Total due today  by card",
    );
    await expect(page.getByTestId("pdf-editor-bold")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("PDF text editor - formatting controls stay reachable", () => {
  for (const width of [1280, 1440, 1600, 1920]) {
    test(`every control, the weight menu included, is reachable at ${width}px`, async ({
      page,
    }) => {
      await serveFonts(page);
      await page.setViewportSize({ width: 1920, height: 1000 });
      await openEditor(page, TAGGED_PDF);
      await pickServerFamily(page, await runId(page, "Revenue grew"));

      await page.setViewportSize({ width, height: 1000 });

      await expect.poll(() => unreachableControls(page)).toEqual([]);
    });
  }
});

function fillOf(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate((rid) => {
    const w = window as unknown as {
      __editor_store: {
        state: {
          pages: {
            runs: { id: string; fill: { r: number; g: number; b: number } }[];
          }[];
        };
      };
    };
    const fill = w.__editor_store.state.pages[0].runs.find(
      (r) => r.id === rid,
    )?.fill;
    return fill ? `${fill.r},${fill.g},${fill.b}` : undefined;
  }, id);
}

/** Narrow the window until the formatting controls fit inline with `slack` pixels to spare. */
async function fitInlineWithSlack(page: Page, slack: number) {
  const spare = await page.evaluate(() => {
    const band = document.querySelector(".pdf-editor-topbar__band")!;
    const last = document.querySelector(
      '[data-testid="pdf-editor-change-case"]',
    )!;
    return Math.floor(
      band.getBoundingClientRect().right - last.getBoundingClientRect().right,
    );
  });
  const size = page.viewportSize()!;
  await page.setViewportSize({
    width: size.width - spare + slack,
    height: size.height,
  });
}

test.describe("PDF text editor - formatting popovers stay open", () => {
  test("the colour picker stays open when opening it widens the field past the toolbar's edge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2200, height: 1000 });
    await openEditor(page, TAGGED_PDF);
    const body = await runId(page, "Revenue grew");
    await runBox(page, body).click();
    await expect(page.getByTestId("pdf-editor-colour")).toBeVisible();
    // Narrower than the open colour field needs, wider than the closed one.
    await fitInlineWithSlack(page, 12);
    await expect(page.getByTestId("pdf-editor-format-menu")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-change-case")).toBeInViewport({
      ratio: 1,
    });
    const before = await fillOf(page, body);

    await page.getByTestId("pdf-editor-colour").click();
    const saturation = page.locator(".mantine-ColorInput-saturation").first();
    await expect(saturation).toBeVisible();
    const box = (await saturation.boundingBox())!;
    await saturation.click({ position: { x: box.width - 4, y: 4 } });

    await expect.poll(() => fillOf(page, body)).not.toBe(before);
  });

  for (const width of [1920, 1280]) {
    test(`the change-case menu, outline colour and weight menu open at ${width}px`, async ({
      page,
    }) => {
      await serveFonts(page);
      await page.setViewportSize({ width: 2400, height: 1000 });
      await openEditor(page, TAGGED_PDF);
      const body = await runId(page, "Revenue grew");
      await pickServerFamily(page, body);
      await page.setViewportSize({ width, height: 1000 });
      const menu = page.getByTestId("pdf-editor-format-menu");
      await expect(
        page.getByTestId("pdf-editor-font-weight").or(menu),
      ).toBeVisible();
      const bold = page.getByTestId("pdf-editor-bold");
      // Folded, the controls show once the formatting menu has opened.
      const openFormatting = () =>
        expect(async () => {
          if ((await menu.count()) > 0 && !(await bold.isVisible()))
            await menu.click();
          await expect(bold).toBeVisible({ timeout: 2_000 });
        }).toPass();

      await openFormatting();
      await page.getByTestId("pdf-editor-font-weight").click();
      await expect(
        page.getByRole("option", { name: /Semibold/ }),
      ).toBeVisible();
      await page.getByRole("option", { name: /Semibold/ }).click();
      await expect.poll(() => fontIdOf(page, body)).toMatch(/Semibold/);

      await openFormatting();
      await page.getByTestId("pdf-editor-change-case").click();
      await expect(
        page.getByTestId("pdf-editor-change-case-upper"),
      ).toBeVisible();
      await page.getByTestId("pdf-editor-change-case-upper").click();
      await expect
        .poll(async () => (await runs(page)).find((r) => r.id === body)?.text)
        .toMatch(/^REVENUE GREW/);

      await openFormatting();
      await page.getByTestId("pdf-editor-colour-advanced").click();
      await expect(page.getByTestId("pdf-editor-outline-width")).toBeVisible();
    });
  }
});
