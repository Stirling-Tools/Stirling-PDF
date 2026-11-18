import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// A picture cropped the way Word and PowerPoint crop one: a 200pt image drawn
// through a 100pt window. What the user can grab is the window, never the
// hidden rest of the image.

const PAGE_PT = 300;
const WINDOW_PT = { x: 100, y: 100, width: 100, height: 100 };

function croppedImagePdf(): Buffer {
  return Buffer.from(
    buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_PT} ${PAGE_PT}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>`,
        },
        {
          num: 4,
          body: streamBody(
            "",
            "q 100 100 100 100 re W n 200 0 0 200 50 50 cm /Im Do Q",
          ),
        },
        {
          num: 5,
          body: streamBody(
            "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8",
            "\x00\x00\xff".repeat(4),
          ),
        },
      ],
      1,
    ),
  );
}

interface EditorWin {
  __editor_store: {
    state: {
      pages: Array<{
        images: Array<{ bounds: { x: number; y: number } }>;
      }>;
    };
  };
}

async function openCroppedImage(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, {
    name: "cropped-image.pdf",
    mimeType: "application/pdf",
    buffer: croppedImagePdf(),
  });
  await expect(page.getByTestId("pdf-editor-image-p0-i0")).toBeVisible({
    timeout: 60_000,
  });
}

function imageX(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as EditorWin).__editor_store.state.pages[0].images[0]
        .bounds.x,
  );
}

test.describe("PDF text editor: cropped image", () => {
  test("selects and drags the window the image shows", async ({ page }) => {
    await openCroppedImage(page);
    const canvas = (await page
      .getByTestId("pdf-editor-page-0")
      .locator("canvas")
      .first()
      .boundingBox())!;
    const handle = page.getByTestId("pdf-editor-image-p0-i0");
    const box = (await handle.boundingBox())!;
    const scale = canvas.width / PAGE_PT;
    expect(box.width).toBeCloseTo(WINDOW_PT.width * scale, 0);
    expect(box.height).toBeCloseTo(WINDOW_PT.height * scale, 0);
    expect(box.x - canvas.x).toBeCloseTo(WINDOW_PT.x * scale, 0);
    expect(canvas.y + canvas.height - (box.y + box.height)).toBeCloseTo(
      WINDOW_PT.y * scale,
      0,
    );

    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await handle.click();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 12 });
    const ghost = page.getByTestId("pdf-editor-image-ghost");
    await expect(ghost).toBeAttached();
    const ghostBox = (await ghost.boundingBox())!;
    expect(ghostBox.width).toBeCloseTo(2 * box.width, 0);
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);

    const startX = 50;
    await expect
      .poll(() => imageX(page), { timeout: 30_000 })
      .toBeCloseTo(startX + 60 / scale, 0);
    await expect
      .poll(async () => (await handle.boundingBox())!.x, { timeout: 30_000 })
      .toBeCloseTo(box.x + 60, 0);
    expect((await handle.boundingBox())!.width).toBeCloseTo(box.width, 0);
  });
});
