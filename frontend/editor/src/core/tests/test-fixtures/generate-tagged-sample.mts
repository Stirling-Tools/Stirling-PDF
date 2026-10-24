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

async function main() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.node.setFontDictionary(PDFName.of("F1"), regular.ref);
  page.node.setFontDictionary(PDFName.of("F2"), bold.ref);

  // 2x2 RGB swatch: the figure only has to exist, not to look like anything.
  const pixels = Uint8Array.from([
    200, 60, 60, 60, 160, 60, 60, 60, 200, 220, 180, 40,
  ]);
  const image = ctx.register(
    PDFRawStream.of(
      ctx.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: 2,
        Height: 2,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Length: pixels.length,
      }),
      pixels,
    ),
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
