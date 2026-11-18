import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// While an image is dragged, the page under its old spot shows what will be
// there after the drop, never the image itself and never a blank patch.

interface Fixture {
  size: [number, number];
  content: string;
  /** Page-space box of the image's red ink. */
  ink: { x: number; y: number; width: number; height: number };
}

const SMASK_W = 16;
const SMASK_H = 6;

// A red block in the middle of an image whose margins are transparent, as a
// logo exported with its background removed.
function smaskImage(): { rgb: string; alpha: string } {
  let rgb = "";
  let alpha = "";
  for (let y = 0; y < SMASK_H; y++)
    for (let x = 0; x < SMASK_W; x++) {
      const ink = x >= 3 && x < 13 && y >= 1 && y < 5;
      rgb += ink ? "\xcc\x10\x10" : "\xff\xff\xff";
      alpha += ink ? "\xff" : "\x00";
    }
  return { rgb, alpha };
}

function inkOf(x: number, y: number, width: number, height: number) {
  return {
    x: x + (width * 3) / SMASK_W,
    y: y + height / SMASK_H,
    width: (width * 10) / SMASK_W,
    height: (height * 4) / SMASK_H,
  };
}

function buildPdf({ size, content }: Fixture): Buffer {
  const { rgb, alpha } = smaskImage();
  const icon = "\x10\x80\x10".repeat(16);
  const stream = (dict: string, data: string) =>
    `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size[0]} ${size[1]}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R /Ic 7 0 R >> /Font << /F1 8 0 R >> >> >>`,
    stream("", content),
    stream(
      `/Type /XObject /Subtype /Image /Width ${SMASK_W} /Height ${SMASK_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 6 0 R`,
      rgb,
    ),
    stream(
      `/Type /XObject /Subtype /Image /Width ${SMASK_W} /Height ${SMASK_H} /ColorSpace /DeviceGray /BitsPerComponent 8`,
      alpha,
    ),
    stream(
      "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8",
      icon,
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let out = "%PDF-1.7\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// The structure Microsoft Print To PDF writes: filled and stroked boxes as
// paths, a large image with transparent margins, small icons each in a clip.
const PRINT_TO_PDF: Fixture = {
  size: [612, 792],
  content: [
    "0.93 0.95 0.98 rg 0 680 612 112 re f",
    "0.2 0.3 0.5 RG 1 w 20 690 572 90 re S",
    "1 1 1 rg 25 695 300 80 re f",
    "q 184.6 0 0 55.2 31.8 707.9 cm /Im Do Q",
    ...[
      [520, 760],
      [545, 760],
      [60, 400],
    ].map(
      ([x, y]) =>
        `q ${x} ${y} 14 14 re W n 18 0 0 18 ${x - 2} ${y - 2} cm /Ic Do Q`,
    ),
  ].join("\n"),
  ink: inkOf(31.8, 707.9, 184.6, 55.2),
};

// Text under the ink, text over the image, on a tinted page, so a blank or
// stale patch at the old spot cannot pass for the page beneath.
const TEXT_UNDER: Fixture = {
  size: [300, 300],
  content: [
    "0.85 0.9 1 rg 0 0 300 300 re f",
    "BT /F1 28 Tf 0 0 0 rg 95 125 Td (UNDER) Tj ET",
    "q 200 0 0 75 50 100 cm /Im Do Q",
    "BT /F1 10 Tf 0 0 0 rg 216 150 Td (over) Tj ET",
  ].join("\n"),
  ink: inkOf(50, 100, 200, 75),
};

interface InkCounts {
  red: number;
  dark: number;
  white: number;
}

// Pixel counts in the page canvas over page-space `box`, inset so edge
// antialiasing does not count.
function inkCounts(
  page: Page,
  pageSize: [number, number],
  box: Fixture["ink"],
): Promise<InkCounts> {
  return page.evaluate(
    ({ pageSize, box }) => {
      const counts = { red: 0, dark: 0, white: 0 };
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="pdf-editor-page-0"] canvas',
      );
      if (!canvas?.width) return counts;
      const k = canvas.width / pageSize[0];
      const inset = 2;
      const x = Math.round(box.x * k) + inset;
      const y = Math.round((pageSize[1] - box.y - box.height) * k) + inset;
      const w = Math.round(box.width * k) - 2 * inset;
      const h = Math.round(box.height * k) - 2 * inset;
      const data = canvas.getContext("2d")!.getImageData(x, y, w, h).data;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (r > 150 && g < 80 && b < 80) counts.red++;
        if (r < 90 && g < 90 && b < 90) counts.dark++;
        if (r > 250 && g > 250 && b > 250) counts.white++;
      }
      return counts;
    },
    { pageSize, box },
  );
}

async function openFixture(page: Page, fixture: Fixture): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, {
    name: "image-drag.pdf",
    mimeType: "application/pdf",
    buffer: buildPdf(fixture),
  });
  await expect
    .poll(async () => (await inkCounts(page, fixture.size, fixture.ink)).red, {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
}

async function largestImageHandle(page: Page) {
  const id = await page.evaluate(() => {
    const images = (
      window as unknown as {
        __editor_store: {
          state: {
            pages: Array<{
              images: Array<{ id: string; bounds: { width: number } }>;
            }>;
          };
        };
      }
    ).__editor_store.state.pages[0].images;
    return [...images].sort((a, b) => b.bounds.width - a.bounds.width)[0].id;
  });
  return page.getByTestId(`pdf-editor-image-${id}`);
}

function cssPerPoint(page: Page, fixture: Fixture): Promise<number> {
  return page.evaluate(
    (width) =>
      document
        .querySelector('[data-testid="pdf-editor-page-0"] canvas')!
        .getBoundingClientRect().width / width,
    fixture.size[0],
  );
}

// Presses on the image and drags it `dyPt` points up the page, holding on.
async function startDrag(page: Page, fixture: Fixture, dyPt: number) {
  const handle = await largestImageHandle(page);
  const box = (await handle.boundingBox())!;
  // Near the left edge: text drawn over the middle takes presses there.
  const from = { x: box.x + box.width * 0.05, y: box.y + box.height / 2 };
  const dyCss = -dyPt * (await cssPerPoint(page, fixture));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + dyCss, { steps: 12 });
  await expect(page.getByTestId("pdf-editor-image-ghost")).toBeAttached();
}

for (const [name, fixture, dy] of [
  ["a Print To PDF page", PRINT_TO_PDF, -100],
  ["text under the image", TEXT_UNDER, 80],
] as const) {
  test.describe(`PDF text editor: dragging an image over ${name}`, () => {
    test("shows the page beneath the old spot, then the image where it is dropped", async ({
      page,
    }) => {
      await openFixture(page, fixture);
      const before = await inkCounts(page, fixture.size, fixture.ink);
      await startDrag(page, fixture, dy);

      await expect
        .poll(
          async () => (await inkCounts(page, fixture.size, fixture.ink)).red,
        )
        .toBe(0);
      const during = await inkCounts(page, fixture.size, fixture.ink);
      if (fixture === TEXT_UNDER) {
        expect(before.dark).toBe(0);
        expect(during.dark).toBeGreaterThan(0);
        expect(during.white).toBe(0);
      } else {
        expect(during.white).toBeGreaterThan(0);
      }

      await page.mouse.up();
      await expect(page.getByTestId("pdf-editor-image-ghost")).toHaveCount(0, {
        timeout: 30_000,
      });
      expect((await inkCounts(page, fixture.size, fixture.ink)).red).toBe(0);
      const moved = { ...fixture.ink, y: fixture.ink.y + dy };
      expect((await inkCounts(page, fixture.size, moved)).red).toBeGreaterThan(
        0,
      );
    });

    test("puts the image back when Escape cancels the drag", async ({
      page,
    }) => {
      await openFixture(page, fixture);
      const before = await inkCounts(page, fixture.size, fixture.ink);
      await startDrag(page, fixture, dy);
      await expect
        .poll(
          async () => (await inkCounts(page, fixture.size, fixture.ink)).red,
        )
        .toBe(0);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("pdf-editor-image-ghost")).toHaveCount(0);
      expect(await inkCounts(page, fixture.size, fixture.ink)).toEqual(before);
      await page.mouse.up();
      expect(await inkCounts(page, fixture.size, fixture.ink)).toEqual(before);
    });
  });
}
