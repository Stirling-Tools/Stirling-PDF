// @vitest-environment node
// jsdom's Blob cannot stream, so a rewritten stream would not inflate.
import { describe, expect, it } from "vitest";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { nameArtifactKinds } from "@editor/tools/pdfTextEditor/pdfdoc/passes/nameArtifactKinds";
import { singleContentPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

async function contentOf(bytes: Uint8Array): Promise<string> {
  const pdf = (await RawPdf.parse(bytes))!;
  return toLatin1((await pdf.pageContent(pdf.pageNumberAt(0)!))!);
}

describe("nameArtifactKinds", () => {
  it("writes an artifact's string kind as names", async () => {
    const bytes = singleContentPdf(
      "/Artifact <</Subtype(Footer)/Type(Pagination)>> BDC BT /F1 12 Tf (hi) Tj ET EMC",
    );
    const out = await nameArtifactKinds(bytes, [0]);
    expect(await contentOf(out)).toContain(
      "/Artifact <</Subtype/Footer/Type/Pagination>> BDC",
    );
  });

  it("leaves other marks' strings, and other keys, as they are", async () => {
    const content =
      "/Span <</Type(Pagination)>> BDC EMC " +
      "/Artifact <</Type/Layout/Alt(Rule)>> BDC EMC";
    const bytes = singleContentPdf(content);
    expect(await nameArtifactKinds(bytes, [0])).toBe(bytes);
  });

  it("leaves pages it is not asked about", async () => {
    const bytes = singleContentPdf(
      "/Artifact <</Type(Pagination)>> BDC BT /F1 12 Tf (hi) Tj ET EMC",
    );
    expect(await nameArtifactKinds(bytes, [])).toBe(bytes);
  });
});
