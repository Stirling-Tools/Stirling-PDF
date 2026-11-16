// @vitest-environment node
// jsdom's Blob cannot stream, so the fixture's object stream would not inflate.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { HeadingType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  headingOutline,
  issueCount,
  type DocumentHeading,
} from "@editor/tools/pdfTextEditor/util/headingOutline";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);

const heading = (type: HeadingType, mcid = 0): DocumentHeading => ({
  type,
  pageIndex: 0,
  mcids: [mcid],
});

function issues(...types: HeadingType[]) {
  return headingOutline(
    types.map((type) => heading(type)),
    [],
  ).entries.map((entry) => entry.issue);
}

describe("headingOutline", () => {
  test("accepts levels that step down one at a time and jump back up", () => {
    expect(issues("H1", "H2", "H3", "H1", "H2")).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  test("reports a first heading other than H1", () => {
    expect(issues("H2", "H3")).toEqual([{ kind: "first-not-h1" }, null]);
  });

  test("reports a level skipped on the way down", () => {
    expect(issues("H1", "H3", "H4", "H2", "H5")).toEqual([
      null,
      { kind: "skipped-level", previous: 1 },
      null,
      null,
      { kind: "skipped-level", previous: 2 },
    ]);
  });

  test("reports H used alongside numbered headings, once", () => {
    const outline = headingOutline(
      [heading("H1"), heading("H"), heading("H2")],
      [],
    );
    expect(outline.mixesNumbering).toBe(true);
    expect(outline.entries.map((entry) => entry.issue)).toEqual([
      null,
      null,
      null,
    ]);
    expect(issueCount(outline)).toBe(1);
    expect(
      headingOutline([heading("H"), heading("H")], []).mixesNumbering,
    ).toBe(false);
  });

  test("finds the run showing each heading on its page", () => {
    const page = {
      pageIndex: 0,
      runs: [
        { id: "body", text: "Body", mcid: 1 },
        { id: "title", text: "Title", mcid: 0 },
      ],
    } as unknown as PageSnapshot;
    const [found, missing] = headingOutline(
      [heading("H1", 0), heading("H2", 5)],
      [page],
    ).entries;
    expect(found.run?.id).toBe("title");
    expect(missing.run).toBeNull();
  });
});

describe("reading blocks from the file", () => {
  test("lists blocks in reading order with the pages they are drawn on", async () => {
    const structure = await readFileStructure(
      new Uint8Array(await readFile(TAGGED_SAMPLE)),
    );
    expect(
      structure!.blocks
        .filter(({ type }) => type?.startsWith("H"))
        .map(({ type, pageIndex }) => [type, pageIndex]),
    ).toEqual([
      ["H1", 0],
      ["H2", 1],
      ["H3", 1],
      ["H3", 1],
      ["H5", 1],
      ["H2", 1],
    ]);
  });
});
