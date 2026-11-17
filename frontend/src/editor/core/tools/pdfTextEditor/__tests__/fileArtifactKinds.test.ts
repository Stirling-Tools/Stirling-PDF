import { describe, expect, it } from "vitest";
import { pairArtifactKinds } from "@editor/tools/pdfTextEditor/model/fileArtifactKinds";
import { artifactSequences } from "@editor/tools/pdfTextEditor/pdfdoc/artifactSequences";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const SHOW = "BT /F1 12 Tf 72 72 Td (x) Tj ET";
const FOOTER = { type: "Pagination", subtype: "Footer" };

/** One page drawing `content`, with property list /P0 naming a layout artifact. */
async function sequencesOf(content: string) {
  const pdf = await RawPdf.parse(
    buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body:
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
            "/Resources << /Font << /F1 5 0 R >> /Properties << /P0 << /Type /Layout >> >> >> >>",
        },
        { num: 4, body: streamBody("", content) },
        {
          num: 5,
          body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        },
      ],
      1,
    ),
  );
  return artifactSequences(pdf!, pdf!.pageNumberAt(0)!);
}

describe("artifactSequences", () => {
  it("reads an inline property list's kind, and its entries", async () => {
    expect(
      await sequencesOf(
        `/Artifact <</Type /Pagination /Subtype /Footer /Attached [/Bottom]>> BDC ${SHOW} EMC`,
      ),
    ).toEqual([{ kind: FOOTER, entries: 3 }]);
  });

  it("reads a named property list", async () => {
    expect(await sequencesOf(`/Artifact /P0 BDC ${SHOW} EMC`)).toEqual([
      { kind: { type: "Layout", subtype: null }, entries: 1 },
    ]);
  });

  it("leaves out artifacts with no named /Type, and those that draw nothing", async () => {
    expect(
      await sequencesOf(
        [
          `/Artifact BMC ${SHOW} EMC`,
          `/Artifact <</Type (Pagination)>> BDC ${SHOW} EMC`,
          "/Artifact <</Type /Pagination>> BDC BT /F1 12 Tf () Tj ET EMC",
          "/Artifact <</Type /Pagination>> BDC 0 0 10 10 re W n EMC",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("counts what a nested sequence draws towards the artifact around it", async () => {
    expect(
      await sequencesOf(
        `/Artifact <</Type /Pagination /Subtype /Footer>> BDC /Span <<>> BDC ${SHOW} EMC EMC`,
      ),
    ).toEqual([{ kind: FOOTER, entries: 2 }]);
  });
});

describe("pairArtifactKinds", () => {
  const sequence = { kind: FOOTER, entries: 2 };

  it("gives each mark the kind of the sequence at its place", () => {
    expect(
      pairArtifactKinds([{ ptr: 7, entries: 2, subtyped: true }], [sequence]),
    ).toEqual(new Map([[7, FOOTER]]));
  });

  it.each([
    ["more marks than sequences", [{ ptr: 7, entries: 2, subtyped: true }], []],
    [
      "entry counts differ",
      [{ ptr: 7, entries: 3, subtyped: true }],
      [sequence],
    ],
    [
      "only one names a /Subtype",
      [{ ptr: 7, entries: 2, subtyped: false }],
      [sequence],
    ],
  ])("pairs nothing when %s", (_, refs, sequences) => {
    expect(pairArtifactKinds(refs, sequences)).toBeNull();
  });
});
