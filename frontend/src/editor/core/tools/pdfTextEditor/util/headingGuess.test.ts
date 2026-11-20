import { describe, expect, it } from "vitest";
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import {
  guessHeadings,
  type HeadingPage,
  type HeadingRun,
} from "@editor/tools/pdfTextEditor/util/headingGuess";

const BODY =
  "Body text runs on for a good while so that it carries most of the characters";

const BLACK = { r: 0, g: 0, b: 0, a: 255 };
/** A Letter page turned a quarter for display. */
const LETTER_TURNED: DisplayTransformData = {
  a: 0,
  b: 1,
  c: -1,
  d: 0,
  e: 792,
  f: 0,
  cropLeft: 0,
  cropBottom: 0,
  cropWidth: 612,
  cropHeight: 792,
  rotate: 90,
  displayWidth: 792,
  displayHeight: 612,
};
const BLUE = { r: 30, g: 80, b: 180, a: 255 };

let nextId = 0;
/** A run on a line of its own, each one below the last. */
function run(text: string, fontSize: number, bold = false): HeadingRun {
  const id = nextId++;
  return {
    id: `r${id}`,
    text,
    fontSize,
    bold,
    fill: BLACK,
    bounds: { x: 72, y: 10_000 - id * 50, width: 200, height: fontSize },
  };
}

/** A page every run of which auto-tag will tag, in the order given. */
function onPage(pageIndex: number, runs: HeadingRun[]): HeadingPage {
  return { pageIndex, runs, tagged: runs.map((r) => r.id), display: null };
}

/** Each run's guessed level by its text, "P" where it is not a heading. */
function levels(...runs: HeadingRun[]): Record<string, string> {
  const guessed = guessHeadings([onPage(0, runs)]).get(0);
  return Object.fromEntries(
    runs.map((r) => [r.text, guessed?.get(r.id) ?? "P"]),
  );
}

describe("guessHeadings", () => {
  it("ranks larger styles as higher headings", () => {
    expect(
      levels(
        run("Annual report", 24),
        run("Results", 16),
        run("By region", 13),
        run("By product", 13),
        run("Outlook", 16),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Annual report": "H1",
      Results: "H2",
      Outlook: "H2",
      "By region": "H3",
      "By product": "H3",
      [BODY]: "P",
    });
  });

  it("counts a bold block at the body size as a heading, below a larger one", () => {
    expect(
      levels(
        run("Results", 14, true),
        run("Method", 10, true),
        run("Sample", 10, true),
        run("Outlook", 14, true),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      Results: "H1",
      Outlook: "H1",
      Method: "H2",
      Sample: "H2",
      [BODY]: "P",
    });
  });

  it("ranks bold above regular at the same size", () => {
    expect(
      levels(
        run("Part one", 18, true),
        run("Chapter one", 18),
        run("Chapter two", 18),
        run("Part two", 18, true),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Part one": "H1",
      "Part two": "H1",
      "Chapter one": "H2",
      "Chapter two": "H2",
      [BODY]: "P",
    });
  });

  it("leaves text barely larger than the body, sentences and drop caps as paragraphs", () => {
    expect(
      levels(
        run("Slightly larger", 10.5),
        run("A short sentence.", 16),
        run("T", 30),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Slightly larger": "P",
      "A short sentence.": "P",
      T: "P",
      [BODY]: "P",
    });
  });

  it("leaves figures, pull quotes and author lists as paragraphs", () => {
    expect(
      levels(
        run("42%", 30),
        run("1 in 3", 30),
        run("\u201cWe measure what matters\u201d", 16),
        run("A. Mbeki, J. Q. Tran, R. Ferreira", 14),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "42%": "P",
      "1 in 3": "P",
      "\u201cWe measure what matters\u201d": "P",
      "A. Mbeki, J. Q. Tran, R. Ferreira": "P",
      [BODY]: "P",
    });
  });

  it("leaves a row of table header cells as paragraphs", () => {
    const cells = ["Segment", "Revenue", "Margin"].map((text, i) => ({
      ...run(text, 10, true),
      bounds: { x: 72 + i * 110, y: 500, width: 60, height: 10 },
    }));
    const guessed = guessHeadings([
      onPage(0, [...cells, run(BODY, 10), run(BODY, 10)]),
    ]);
    expect(guessed.get(0)).toBeUndefined();
  });

  it("gives a style set only once below the top the level above it", () => {
    expect(
      levels(
        run("Annual report", 30),
        run("Building the next century of infrastructure", 20),
        run("Results", 14),
        run("Outlook", 14),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Annual report": "H1",
      "Building the next century of infrastructure": "H1",
      Results: "H2",
      Outlook: "H2",
      [BODY]: "P",
    });
  });

  it("leaves a style mostly used for long text, such as a lead paragraph, as paragraphs", () => {
    const lead =
      "A lead paragraph set a little larger than the body, long enough to run across many lines of the page and well past any heading";
    expect(
      levels(
        run("In short", 14),
        run(lead, 14),
        run(BODY, 10),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "In short": "P",
      [lead]: "P",
      [BODY]: "P",
    });
  });

  it("levels a style the same on every page", () => {
    const [title, first, second] = [
      run("Report", 24),
      run("Summary", 16),
      run("Details", 16),
    ];
    const guessed = guessHeadings([
      onPage(0, [title, first, run(BODY, 10)]),
      onPage(1, [second, run(BODY, 10)]),
    ]);
    expect(guessed.get(0)?.get(first.id)).toBe("H2");
    expect(guessed.get(1)?.get(second.id)).toBe("H2");
  });

  it("neither guesses nor counts the runs it is told to skip", () => {
    const watermark = run("DRAFT", 60);
    const guessed = guessHeadings(
      [onPage(0, [watermark, run("Summary", 16), run(BODY, 10)])],
      new Map([[0, new Map([[watermark.id, "Watermark"]])]]),
    );
    expect(guessed.get(0)?.has(watermark.id)).toBe(false);
    expect([...(guessed.get(0)?.values() ?? [])]).toEqual(["H1"]);
  });

  it("counts a colour at the body size as emphasis, below bold", () => {
    const coloured = (text: string) => ({ ...run(text, 10), fill: BLUE });
    expect(
      levels(
        run("Report", 20),
        run("Background", 10, true),
        run("Findings", 10, true),
        coloured("Method"),
        coloured("Sample"),
        run("SCOPE", 10),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      Report: "H1",
      Background: "H2",
      Findings: "H2",
      Method: "H3",
      Sample: "H3",
      SCOPE: "P",
      [BODY]: "P",
    });
  });

  it("leaves grey text, form labels and asides in brackets as paragraphs", () => {
    const grey = { r: 120, g: 120, b: 120, a: 255 };
    expect(
      levels(
        { ...run("Updated March 2026", 10), fill: grey },
        { ...run("Last reviewed", 10), fill: grey },
        run("Name:", 14, true),
        run("[2 marks]", 14, true),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Updated March 2026": "P",
      "Last reviewed": "P",
      "Name:": "P",
      "[2 marks]": "P",
      [BODY]: "P",
    });
  });

  it("never skips a level in reading order, starting at H1", () => {
    expect(
      levels(
        run("Spring issue", 13),
        run("Annual report", 24),
        run("Background", 13),
        run("Results", 16),
        run("By region", 13),
        run("Outlook", 16),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Spring issue": "H1",
      "Annual report": "H1",
      Background: "H2",
      Results: "H2",
      "By region": "H3",
      Outlook: "H2",
      [BODY]: "P",
    });
  });

  it("nests headings of the sixth and seventh largest styles a level apart", () => {
    const sizes = [40, 34, 28, 24, 20, 17, 14];
    const [top, sixth, seventh, ...rest] = [40, 17, 14, 34, 28, 24, 20].map(
      (size) => run(`Heading at ${size}`, size),
    );
    const repeats = sizes.map((size) => run(`Again at ${size}`, size));
    const body = Array.from({ length: 12 }, () => run(BODY, 10));
    expect(
      levels(top, sixth, seventh, ...rest, ...repeats, ...body),
    ).toMatchObject({
      "Heading at 40": "H1",
      "Heading at 17": "H2",
      "Heading at 14": "H3",
    });
  });

  it("gives sections of one style one level when a larger style first appears after them", () => {
    expect(
      levels(
        run("Introduction", 16),
        run("Background", 16),
        run("Method", 16),
        run("Appendix A", 24),
        run("Appendix B", 24),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      Introduction: "H1",
      Background: "H1",
      Method: "H1",
      "Appendix A": "H1",
      "Appendix B": "H1",
      [BODY]: "P",
    });
  });

  it("keeps sections of one style level under a title when larger parts follow them", () => {
    expect(
      levels(
        run("Annual Report", 28),
        run("Overview", 14),
        run("Results", 14),
        run("Outlook", 14),
        run("Part Two", 20),
        run("Part Three", 20),
        run(BODY, 10),
        run(BODY, 10),
      ),
    ).toEqual({
      "Annual Report": "H1",
      Overview: "H2",
      Results: "H2",
      Outlook: "H2",
      "Part Two": "H2",
      "Part Three": "H2",
      [BODY]: "P",
    });
  });

  it("levels only the runs auto-tag will tag, in the order it tags them", () => {
    const title = run("Annual report", 24);
    const [results, outlook] = [
      run("Results", 14, true),
      run("Outlook", 14, true),
    ];
    const body = [run(BODY, 10), run(BODY, 10)];
    const guessed = guessHeadings([
      {
        ...onPage(0, [title, results, outlook, ...body]),
        tagged: [outlook.id, results.id, ...body.map((r) => r.id)],
      },
    ]).get(0)!;
    expect(guessed.has(title.id)).toBe(false);
    expect([guessed.get(outlook.id), guessed.get(results.id)]).toEqual([
      "H1",
      "H1",
    ]);
  });

  it("reads a turned page's table rows along its displayed lines", () => {
    const cells = ["Segment", "Revenue", "Margin"].map((text, i) => ({
      ...run(text, 10, true),
      bounds: { x: 300, y: 100 + i * 150, width: 10, height: 60 },
    }));
    const guessed = guessHeadings([
      {
        ...onPage(0, [...cells, run(BODY, 10), run(BODY, 10)]),
        display: LETTER_TURNED,
      },
    ]);
    expect(guessed.get(0)).toBeUndefined();
  });

  it("stops at H6", () => {
    const sizes = [40, 34, 28, 24, 20, 17, 14];
    const runs = sizes.flatMap((size) => [
      run(`Level ${size}`, size),
      run(`Also level ${size}`, size),
    ]);
    const guessed = guessHeadings([
      onPage(0, [...runs, run(BODY, 10), run(BODY, 10)]),
    ]).get(0)!;
    expect(
      runs.filter((_, i) => i % 2 === 0).map((r) => guessed.get(r.id)),
    ).toEqual(["H1", "H2", "H3", "H4", "H5", "H6", "H6"]);
  });
});
