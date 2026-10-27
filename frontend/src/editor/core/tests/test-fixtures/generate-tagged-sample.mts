import process from "node:process";
// One-off script: generate `tagged-sample.pdf`, a tagged page whose text, image
// and page number are each tied into the structure tree the way a word
// processor's accessible export ties them: a heading (MCID 0), a two-line
// paragraph in ONE marked-content sequence (MCID 1), a described figure
// (MCID 2), and a page number marked as a pagination artifact.
//
// Run with: npx tsx generate-tagged-sample.mts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  type PDFRef,
  PDFString,
  StandardFonts,
} from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONTENT = [
  "/H1 <</MCID 0>> BDC BT /F2 28 Tf 72 700 Td (Quarterly report) Tj ET EMC",
  "/P <</MCID 1>> BDC",
  "BT /F1 14 Tf 72 660 Td (Revenue grew in every region this quarter,) Tj ET",
  "BT /F1 14 Tf 72 642 Td (led by demand for the new product line.) Tj ET",
  "EMC",
  "/Figure <</MCID 2>> BDC q 120 0 0 80 72 520 cm /Im1 Do Q EMC",
  "/Artifact <</Type /Pagination>> BDC BT /F1 10 Tf 300 40 Td (Page 1) Tj ET EMC",
  "",
].join("\n");

const CHART_WIDTH = 120;
const CHART_HEIGHT = 80;
/** Revenue for four regions, as bar heights in pixels. */
const BAR_HEIGHTS = [42, 30, 56, 22];

/**
 * RGB samples of a bar chart, top row first: four bars on a pair of axes over
 * light gridlines, so the figure's description describes what it shows.
 */
function barChartPixels(): Uint8Array {
  const pixels = new Uint8Array(CHART_WIDTH * CHART_HEIGHT * 3).fill(255);
  const paint = (x: number, y: number, rgb: [number, number, number]) => {
    pixels.set(rgb, (y * CHART_WIDTH + x) * 3);
  };
  const baseline = CHART_HEIGHT - 8;
  for (let y = baseline - 15; y > 6; y -= 15) {
    for (let x = 9; x < CHART_WIDTH - 6; x++) paint(x, y, [225, 225, 225]);
  }
  BAR_HEIGHTS.forEach((height, i) => {
    const left = 16 + i * 26;
    for (let y = baseline - height; y < baseline; y++) {
      for (let x = left; x < left + 18; x++) paint(x, y, [59, 130, 246]);
    }
  });
  for (let x = 8; x < CHART_WIDTH - 6; x++) paint(x, baseline, [90, 90, 90]);
  for (let y = 6; y <= baseline; y++) paint(8, y, [90, 90, 90]);
  return pixels;
}

async function main() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.node.setFontDictionary(PDFName.of("F1"), regular.ref);
  page.node.setFontDictionary(PDFName.of("F2"), bold.ref);

  // Drawn at one pixel per point, matching the 120x80 box the content places it in.
  const image = ctx.register(
    ctx.flateStream(barChartPixels(), {
      Type: "XObject",
      Subtype: "Image",
      Width: CHART_WIDTH,
      Height: CHART_HEIGHT,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
    }),
  );
  page.node.setXObject(PDFName.of("Im1"), image);

  const content = new TextEncoder().encode(CONTENT);
  page.node.set(
    PDFName.of("Contents"),
    ctx.register(PDFRawStream.of(ctx.obj({ Length: content.length }), content)),
  );
  page.node.set(PDFName.of("StructParents"), PDFNumber.of(0));

  const rootRef = ctx.nextRef();
  const documentRef = ctx.nextRef();
  const element = (
    type: string,
    mcid: number,
    extra: Record<string, PDFObject> = {},
  ): PDFRef =>
    ctx.register(
      ctx.obj({
        Type: "StructElem",
        S: type,
        P: documentRef,
        Pg: page.ref,
        K: mcid,
        ...extra,
      }),
    );
  const heading = element("H1", 0);
  const paragraph = element("P", 1);
  const figure = element("Figure", 2, {
    Alt: PDFString.of("Bar chart of revenue by region"),
  });
  ctx.assign(
    documentRef,
    ctx.obj({
      Type: "StructElem",
      S: "Document",
      P: rootRef,
      K: [heading, paragraph, figure],
    }),
  );
  const parentTree = ctx.register(
    ctx.obj({ Nums: [0, [heading, paragraph, figure]] }),
  );
  ctx.assign(
    rootRef,
    ctx.obj({
      Type: "StructTreeRoot",
      K: documentRef,
      ParentTree: parentTree,
      ParentTreeNextKey: 1,
    }),
  );

  doc.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
  doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("en-US"));
  doc.setTitle("Quarterly report");

  const bytes = await doc.save();
  const out = join(__dirname, "tagged-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
