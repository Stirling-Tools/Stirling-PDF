// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  familyKey,
  parseFaceName,
} from "@editor/tools/pdfTextEditor/util/faceNames";
import {
  BUILT_IN_FAMILIES,
  canRestyle,
  documentFamilies,
  externalFamilies,
  faceKeepingStyle,
  restyledFace,
  type FaceSources,
} from "@editor/tools/pdfTextEditor/util/fontFaces";
import { deriveToolbarState } from "@editor/tools/pdfTextEditor/util/toolbarState";
import type { LocalFont } from "@editor/tools/pdfTextEditor/util/localFonts";
import type {
  PageSnapshot,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";

// Names as pdffonts lists them in the test fixtures and the regression corpus.
const REAL_NAMES: Array<[string, string, number, boolean]> = [
  ["AAAAAA+LiberationSans", "LiberationSans", 400, false],
  ["BAAAAA+LiberationSans-Bold", "LiberationSans", 700, false],
  ["CAAAAA+LiberationSans-Italic", "LiberationSans", 400, true],
  ["DAAAAA+LiberationSans-BoldItalic", "LiberationSans", 700, true],
  ["Arial,Bold", "Arial", 700, false],
  ["Arial,BoldItalic", "Arial", 700, true],
  ["EAAAAA+Arial-BoldMT", "Arial", 700, false],
  ["XOAUWI+ArialMT", "Arial", 400, false],
  ["Helvetica-Oblique", "Helvetica", 400, true],
  ["Helvetica-BoldOblique", "Helvetica", 700, true],
  ["Times-BoldItalic", "Times", 700, true],
  ["Times-Roman", "Times", 400, false],
  ["YNEWNN+TimesNewRomanPSMT", "TimesNewRoman", 400, false],
  ["ESSOFH+Times-New-Roman,", "Times New Roman", 400, false],
  ["CLJQKD+Trebuchet-MS-Bold", "Trebuchet MS", 700, false],
  ["JUEZMN+TrebuchetMS-Bold", "TrebuchetMS", 700, false],
  ["DWPUQU+Georgia-Bold-Italic", "Georgia", 700, true],
  ["XRKQNH+Palatino-Roman", "Palatino", 400, false],
  ["QMJUWP+NimbusRomNo9L-Medi", "NimbusRomNo9L", 700, false],
  ["NimbusRomNo9L-MediItal", "NimbusRomNo9L", 700, true],
  ["NimbusSanL-Bold", "NimbusSanL", 700, false],
  ["NimbusSanL-ReguItal", "NimbusSanL", 400, true],
  ["URWBookmanL-Ligh", "URWBookmanL", 300, false],
  ["URWBookmanL-DemiBoldItal", "URWBookmanL", 600, true],
  ["Roboto-Medium", "Roboto", 500, false],
  ["Franklin Gothic Medium", "Franklin Gothic", 500, false],
  ["XICEAB+NimbusRomNo9L-ReguItal", "NimbusRomNo9L", 400, true],
  ["ONWLAQ+LMRoman12-Bold", "LMRoman12", 700, false],
  ["AAAAAA+HiraginoSans-W4", "HiraginoSans", 400, false],
  ["KVGQPY+StandardSymL-Slant_167", "StandardSymL", 400, true],
  [
    "AAAAAA+.SFNS-Regular_wdth_opsz200000_GRAD_wght2580000",
    ".SFNS",
    600,
    false,
  ],
  ["JAAAAA+.SFNS-Bold", ".SFNS", 700, false],
  ["Calibri Bold", "Calibri", 700, false],
  ["Segoe UI Semibold", "Segoe UI", 600, false],
  ["Segoe UI Semi Bold Italic", "Segoe UI", 600, true],
  ["MinionPro-BoldIt", "MinionPro", 700, true],
  ["HelveticaNeueBold", "HelveticaNeue", 700, false],
  ["Calibri Light", "Calibri", 300, false],
  ["Arial Black", "Arial", 900, false],
];

describe("parseFaceName", () => {
  it.each(REAL_NAMES)(
    "reads %s as %s at %i",
    (name, family, weight, italic) => {
      const parsed = parseFaceName(name);
      expect(parsed.family).toBe(family);
      expect(parsed.weight).toBe(weight);
      expect(parsed.italic).toBe(italic);
    },
  );

  it("keys one family the same whatever its separators", () => {
    expect(familyKey(parseFaceName("Trebuchet-MS-Bold").family)).toBe(
      familyKey(parseFaceName("TrebuchetMS").family),
    );
    expect(familyKey(parseFaceName("Times-New-Roman,").family)).toBe(
      familyKey(parseFaceName("TimesNewRomanPSMT").family),
    );
    expect(familyKey(parseFaceName("Courier-New").family)).toBe(
      familyKey(parseFaceName("CourierNewPSMT").family),
    );
  });

  it("leaves a name with no style words whole", () => {
    expect(parseFaceName("Helvetica Neue").family).toBe("Helvetica Neue");
    expect(parseFaceName("Book Antiqua").family).toBe("Book Antiqua");
    expect(parseFaceName("CairoFont-8-0").family).toBe("CairoFont 8 0");
  });
});

describe("family grouping", () => {
  it("lists each built-in family once with all four faces", () => {
    expect(BUILT_IN_FAMILIES.map((entry) => entry.label)).toEqual([
      "Helvetica",
      "Times",
      "Courier",
    ]);
    expect(BUILT_IN_FAMILIES.map((entry) => entry.value)).toEqual([
      "Helvetica",
      "Times-Roman",
      "Courier",
    ]);
    for (const entry of BUILT_IN_FAMILIES) expect(entry.faces).toHaveLength(4);
  });

  it("groups document faces of one family whatever their name spelling", () => {
    const families = documentFamilies([
      "pdf:1:Arial",
      "pdf:2:Arial,Bold",
      "pdf:3:Arial-BoldMT",
      "pdf:4:Arial,Italic",
      "pdf:5:Georgia-Bold",
    ]);
    expect(families.map((entry) => entry.label)).toEqual(["Arial", "Georgia"]);
    expect(families[0].faces.map((f) => [f.value, f.weight, f.italic])).toEqual(
      [
        ["pdf:1:Arial", 400, false],
        ["pdf:2:Arial,Bold", 700, false],
        ["pdf:4:Arial,Italic", 400, true],
      ],
    );
  });

  it("lists a bold-only family under its family name, standing for it by the bold face", () => {
    const [georgia] = documentFamilies(["pdf:5:Georgia-Bold"]);
    expect(georgia.label).toBe("Georgia");
    expect(georgia.value).toBe("pdf:5:Georgia-Bold");
  });

  it("names an external face so the face lookup finds it again", () => {
    const fonts: LocalFont[] = [
      face("Segoe UI", "Regular"),
      face("Segoe UI", "Semibold"),
      face("Segoe UI", "Bold"),
      face("Segoe UI", "Bold Italic"),
      face("Acme Display Bold", "Regular"),
    ];
    const families = externalFamilies(fonts);
    expect(families.map((entry) => entry.label)).toEqual([
      "Acme Display",
      "Segoe UI",
    ]);
    expect(families[0].faces).toEqual([
      { value: "Acme Display Bold", weight: 700, italic: false },
    ]);
    expect(families[1].faces.map((f) => f.value)).toEqual([
      "Segoe UI",
      "Segoe UI Semibold",
      "Segoe UI Bold",
      "Segoe UI Bold Italic",
    ]);
  });
});

function face(family: string, style: string): LocalFont {
  return {
    family,
    style,
    fullName: style === "Regular" ? family : `${family} ${style}`,
    postscriptName: `${family.replace(/ /g, "")}-${style.replace(/ /g, "")}`,
  };
}

const NO_SOURCES: FaceSources = { documentFamilies: [], externalFonts: null };

describe("restyledFace", () => {
  const liberation = documentFamilies([
    "pdf:1:LiberationSans",
    "pdf:2:LiberationSans-Bold",
    "pdf:3:LiberationSans-Italic",
  ]);
  const sources: FaceSources = {
    documentFamilies: liberation,
    externalFonts: null,
  };

  it("moves a document run to the document's own bold face", () => {
    expect(restyledFace("pdf:1:LiberationSans", { bold: true }, sources)).toBe(
      "pdf:2:LiberationSans-Bold",
    );
    expect(
      restyledFace("pdf:2:LiberationSans-Bold", { bold: false }, sources),
    ).toBe("pdf:1:LiberationSans");
  });

  it("has nothing for a style the family lacks, and nothing to do for one it is in", () => {
    expect(
      restyledFace("pdf:3:LiberationSans-Italic", { bold: true }, sources),
    ).toBeNull();
    expect(
      restyledFace("pdf:2:LiberationSans-Bold", { bold: true }, sources),
    ).toBeUndefined();
  });

  it("flips a built-in face in place", () => {
    expect(
      restyledFace("base14:Times-Italic", { bold: true }, NO_SOURCES),
    ).toBe("Times-BoldItalic");
  });

  it("never synthesises bold for a family with no bold face", () => {
    expect(
      restyledFace("pdf:9:Garamond", { bold: true }, NO_SOURCES),
    ).toBeNull();
    expect(canRestyle(["pdf:9:Garamond"], { bold: true }, NO_SOURCES)).toBe(
      false,
    );
  });

  it("reaches a weight beyond regular and bold", () => {
    const sfns = documentFamilies([
      "pdf:1:.SFNS-Regular",
      "pdf:2:.SFNS-Regular_wdth_opsz200000_GRAD_wght2580000",
      "pdf:3:.SFNS-Bold",
    ]);
    expect(
      restyledFace(
        "pdf:1:.SFNS-Regular",
        { weight: 600 },
        { documentFamilies: sfns, externalFonts: null },
      ),
    ).toBe("pdf:2:.SFNS-Regular_wdth_opsz200000_GRAD_wght2580000");
  });

  it("keeps a run's weight and slant when its family is picked", () => {
    const [helvetica] = BUILT_IN_FAMILIES;
    expect(faceKeepingStyle(helvetica, { weight: 700, italic: true })).toBe(
      "Helvetica-BoldOblique",
    );
    const [georgia] = documentFamilies(["pdf:5:Georgia-Bold"]);
    expect(faceKeepingStyle(georgia, { weight: 400, italic: false })).toBe(
      "pdf:5:Georgia-Bold",
    );
  });
});

function run(id: string, fontId: string) {
  return {
    id,
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text: "x",
    fontId,
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}

function toolbarFor(runs: ReturnType<typeof run>[], selected: string[]) {
  const pages = [{ pageIndex: 0, runs, images: [] } as unknown as PageSnapshot];
  return deriveToolbarState(pages, {
    runIds: selected,
    imageIds: [],
  } as unknown as SelectionState);
}

describe("toolbar bold state", () => {
  it("offers bold for a document font whose bold face is elsewhere in the document", () => {
    const state = toolbarFor(
      [run("a", "pdf:1:LiberationSans"), run("b", "pdf:2:LiberationSans-Bold")],
      ["a"],
    );
    expect(state.bold).toBe(false);
    expect(state.canBold).toBe(true);
  });

  it("disables bold for a family with no bold face", () => {
    const state = toolbarFor([run("a", "pdf:1:Garamond")], ["a"]);
    expect(state.canBold).toBe(false);
  });

  it("shows a bold-only family as bold and locked", () => {
    const state = toolbarFor([run("a", "pdf:1:Georgia-Bold")], ["a"]);
    expect(state.bold).toBe(true);
    expect(state.canBold).toBe(false);
  });

  it("marks a half-bold selection mixed and lets the toggle make it all bold", () => {
    const state = toolbarFor(
      [run("a", "base14:Helvetica"), run("b", "base14:Helvetica-Bold")],
      ["a", "b"],
    );
    expect(state.mixed.bold).toBe(true);
    expect(state.bold).toBe(false);
    expect(state.canBold).toBe(true);
  });

  it("says Bold is off for want of a bold italic face, not of a bold one", () => {
    const state = toolbarFor(
      [
        run("a", "pdf:1:Georgia-Italic"),
        run("b", "pdf:2:Georgia-Bold"),
        run("c", "pdf:3:Georgia"),
      ],
      ["a"],
    );
    expect(state.canBold).toBe(false);
    expect(state.boldNeedsBoldItalic).toBe(true);
    expect(
      toolbarFor([run("a", "pdf:1:Garamond-Italic")], ["a"])
        .boldNeedsBoldItalic,
    ).toBe(false);
  });

  it("says Italic is off for want of a bold italic face, not of an italic one", () => {
    const state = toolbarFor(
      [run("a", "pdf:1:Georgia-Bold"), run("b", "pdf:2:Georgia-Italic")],
      ["a"],
    );
    expect(state.canItalic).toBe(false);
    expect(state.italicNeedsBoldItalic).toBe(true);
    expect(
      toolbarFor([run("a", "pdf:1:Garamond-Bold")], ["a"])
        .italicNeedsBoldItalic,
    ).toBe(false);
  });

  it("lists the weights of a family with more than regular and bold", () => {
    const sfns = toolbarFor(
      [
        run("a", "pdf:1:.SFNS-Regular"),
        run("b", "pdf:2:.SFNS-Regular_wdth_opsz200000_GRAD_wght2580000"),
        run("c", "pdf:3:.SFNS-Bold"),
      ],
      ["a"],
    );
    expect(sfns.weights).toEqual([400, 600, 700]);
    expect(sfns.weight).toBe(400);
    expect(toolbarFor([run("a", "base14:Helvetica")], ["a"]).weights).toEqual(
      [],
    );
  });
});
