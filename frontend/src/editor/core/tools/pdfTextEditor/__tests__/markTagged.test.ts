// @vitest-environment node
import { describe, expect, test } from "vitest";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  applyMarked,
  isMarked,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/markTagged";
import { buildClassicPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

function pdfWithCatalog(
  catalog: string,
  extra: { num: number; body: string }[] = [],
) {
  return buildClassicPdf(
    [
      { num: 1, body: catalog },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      },
      ...extra,
    ],
    1,
  );
}

async function marked(bytes: Uint8Array): Promise<boolean> {
  const pdf = (await RawPdf.parse(bytes))!;
  return isMarked(pdf, pdf.objectBody(pdf.rootNum)!);
}

describe("applyMarked", () => {
  test("adds /MarkInfo to a catalog that has none", async () => {
    const out = await applyMarked(
      pdfWithCatalog("<< /Type /Catalog /Pages 2 0 R >>"),
      true,
    );
    expect(await marked(out)).toBe(true);
  });

  test("clears an inline /Marked", async () => {
    const out = await applyMarked(
      pdfWithCatalog(
        "<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true /Suspects false >> >>",
      ),
      false,
    );
    expect(await marked(out)).toBe(false);
    const pdf = (await RawPdf.parse(out))!;
    expect(pdf.objectBody(1)).toContain("/Suspects false");
  });

  test("sets /Marked in an indirect /MarkInfo", async () => {
    const out = await applyMarked(
      pdfWithCatalog("<< /Type /Catalog /Pages 2 0 R /MarkInfo 4 0 R >>", [
        { num: 4, body: "<< /Marked false >>" },
      ]),
      true,
    );
    expect(await marked(out)).toBe(true);
    const pdf = (await RawPdf.parse(out))!;
    expect(pdf.objectBody(4)).toContain("/Marked true");
  });

  test("returns the bytes unchanged when the file already says so", async () => {
    const bytes = pdfWithCatalog("<< /Type /Catalog /Pages 2 0 R >>");
    expect(await applyMarked(bytes, false)).toBe(bytes);
  });
});
