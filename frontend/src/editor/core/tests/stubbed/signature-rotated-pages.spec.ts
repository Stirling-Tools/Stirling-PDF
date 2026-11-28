// A visible signature on a /Rotate 90/180/270 page must paint its appearance
// bitmap, not fall back to the "Signed" badge.
import { writeFileSync } from "node:fs";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
} from "@cantoo/pdf-lib";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const ROTATIONS = [0, 90, 180, 270];
const W = 120;
const H = 60;

// Red top-left quadrant, blue bottom-right, so a flipped or rotated bitmap shows.
const AP = `1 0 0 rg 0 ${H / 2} ${W / 2} ${H / 2} re f 0 0 1 rg ${W / 2} 0 ${W / 2} ${H / 2} re f`;

async function buildSignedRotatedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const fields = [];
  for (const [i, rotate] of ROTATIONS.entries()) {
    const page = doc.addPage([600, 800]);
    if (rotate) page.node.set(PDFName.of("Rotate"), PDFNumber.of(rotate));
    const ap = ctx.register(
      ctx.flateStream(AP, {
        Type: "XObject",
        Subtype: "Form",
        BBox: [0, 0, W, H],
      }),
    );
    const sig = ctx.register(
      ctx.obj({
        Type: "Sig",
        Filter: "Adobe.PPKLite",
        SubFilter: "adbe.pkcs7.detached",
        ByteRange: [0, 0, 0, 0],
        Contents: PDFHexString.of("0000"),
      }),
    );
    const widget = ctx.register(
      ctx.obj({
        Type: "Annot",
        Subtype: "Widget",
        FT: "Sig",
        T: PDFString.of(`Signature${i + 1}`),
        F: 4,
        Rect: [100, 200, 100 + W, 200 + H],
        P: page.ref,
        V: sig,
        AP: { N: ap },
      }),
    );
    page.node.set(PDFName.of("Annots"), ctx.obj([widget]));
    fields.push(widget);
  }
  doc.catalog.set(
    PDFName.of("AcroForm"),
    ctx.obj({ Fields: fields, SigFlags: 3 }),
  );
  return doc.save({ useObjectStreams: false });
}

test("signature appearances paint on every page rotation", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = testInfo.outputPath("signed-rotated-pages.pdf");
  writeFileSync(fixture, await buildSignedRotatedPdf());

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, fixture);

  for (const pageIndex of ROTATIONS.keys()) {
    const overlay = page.locator(
      `[data-signature-overlay-page="${pageIndex}"]`,
    );
    await overlay.scrollIntoViewIfNeeded({ timeout: 60_000 });
    const canvas = overlay.locator("canvas");
    await expect(canvas).toHaveCount(1, { timeout: 30_000 });
    // Bitmap pixels stay in unrotated page space; <Rotate> turns them with the page.
    const pixels = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      const at = (fx: number, fy: number) =>
        Array.from(
          ctx!.getImageData(
            Math.floor(fx * el.width),
            Math.floor(fy * el.height),
            1,
            1,
          ).data,
        );
      return { topLeft: at(0.25, 0.25), bottomRight: at(0.75, 0.75) };
    });
    expect(pixels.topLeft, `page ${pageIndex} top-left`).toEqual([
      255, 0, 0, 255,
    ]);
    expect(pixels.bottomRight, `page ${pageIndex} bottom-right`).toEqual([
      0, 0, 255, 255,
    ]);
  }
});
