// One-off script: generate `link-annotations-sample.pdf`, two pages that carry
// four borderless URI link annotations each. Links render through LinkLayer
// overlays; this fixture pins that overlay count and that the annotation layer
// draws no per-link SVG hit box.
//
// Run with: node generate-link-annotations-sample.mjs
import { PDFDocument, StandardFonts, PDFName } from "@cantoo/pdf-lib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGES = 2;
const LINKS_PER_PAGE = 4;

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let pageIndex = 0; pageIndex < PAGES; pageIndex += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Link fixture page ${pageIndex + 1} of ${PAGES}`, {
      x: 40,
      y: 800,
      size: 14,
      font,
    });

    const annots = [];
    for (let link = 0; link < LINKS_PER_PAGE; link += 1) {
      const y = 740 - link * 60;
      page.drawText(`Link ${link + 1}`, {
        x: 40,
        y: y + 16,
        size: 11,
        font,
      });
      const annot = doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [40, y, 240, y + 14],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "URI",
          URI: `https://example.com/page/${pageIndex + 1}/link/${link + 1}`,
        },
      });
      annots.push(doc.context.register(annot));
    }
    page.node.set(PDFName.of("Annots"), doc.context.obj(annots));
  }

  const bytes = await doc.save();
  writeFileSync(join(__dirname, "link-annotations-sample.pdf"), bytes);
  console.log(`wrote link-annotations-sample.pdf (${bytes.length} B)`);
}

await main();
