import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import {
  describeLocation,
  describeObject,
  explainRule,
  ruleTitle,
} from "@editor/utils/accessibilityPlainEnglish";

const t = ((_key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values?.[name] ?? ""),
  )) as unknown as TFunction;

const wrap = (context: string) =>
  `Location [level=CosDocument, context=${context}]`;

function issue(overrides: Partial<AccessibilityIssue>): AccessibilityIssue {
  return {
    clause: "7.1",
    testNumber: "3",
    specification: "PDF/UA-1",
    message: "",
    severity: "error",
    occurrences: 1,
    autoFixable: false,
    ...overrides,
  };
}

describe("explainRule", () => {
  it("explains a known PDF/UA-1 rule by clause and test", () => {
    expect(explainRule(t, issue({ clause: "7.1", testNumber: "3" }))).toMatch(
      /neither tagged as content nor marked as decoration/,
    );
    expect(explainRule(t, issue({ clause: "7.1", testNumber: "10" }))).toMatch(
      /show the file name instead of the document's title/,
    );
  });

  it("returns null for an unknown rule or another standard", () => {
    expect(
      explainRule(t, issue({ clause: "7.99", testNumber: "1" })),
    ).toBeNull();
    expect(
      explainRule(
        t,
        issue({
          specification: "PDF/UA-2",
          clause: "7.1",
          testNumber: "3",
        }),
      ),
    ).toBeNull();
  });
});

describe("ruleTitle", () => {
  it("names a known PDF/UA-1 rule by clause and test", () => {
    expect(ruleTitle(t, issue({ clause: "7.1", testNumber: "11" }))).toBe(
      "No tags",
    );
    expect(ruleTitle(t, issue({ clause: "7.3", testNumber: "1" }))).toBe(
      "Image without a description",
    );
  });

  it("returns null for an unknown rule or another standard", () => {
    expect(ruleTitle(t, issue({ clause: "7.99", testNumber: "1" }))).toBeNull();
    expect(
      ruleTitle(t, issue({ specification: "PDF/UA-2", clause: "7.1" })),
    ).toBeNull();
  });
});

describe("describeObject", () => {
  it.each([
    ["SESimpleContentItem", "A piece of page content"],
    ["PDTrueTypeFont", "A font"],
    ["PDType0Font", "A font"],
    ["PDLinkAnnot", "A link"],
    ["PDFreeTextAnnot", "An annotation"],
    ["SETable", "A Table tag"],
    ["MainXMPPackage", "The document metadata"],
    ["PDSomethingNew", "Something new"],
  ])("%s → %s", (object, expected) => {
    expect(describeObject(t, object)).toBe(expected);
  });
});

describe("describeLocation", () => {
  it.each([
    [
      "root/document[0]/pages[0](9 0 obj PDPage)/contentStream[0](85 0 obj PDSemanticContentStream)/content[0]/contentItem[0]",
      "Page 1 › Content item 1",
    ],
    [
      "root/document[0]/pages[2](10 0 obj PDPage)/contentStream[0](1808 0 obj PDSemanticContentStream)/content[0]/contentItem[2]",
      "Page 3 › Content item 1 › Piece 3",
    ],
    [
      "root/document[0]/pages[0](3 0 obj PDPage)/contentStream[0](8 0 obj PDSemanticContentStream)/operators[7]/font[0](Helvetica-Bold)",
      "Page 1 › Drawing step 8 › Font Helvetica-Bold",
    ],
    [
      "root/document[0]/pages[2](10 0 obj PDPage)/contentStream[0](1808 0 obj PDSemanticContentStream)/operators[27]/usedGlyphs[0](OFSJNI+Times-Bold OFSJNI+Times-Bold 55 0  0 true)",
      "Page 3 › Drawing step 28 › A character in Times-Bold",
    ],
    [
      "root/document[0]/pages[116](1117 0 obj PDPage)/contentStream[0](1118 0 obj PDSemanticContentStream)/operators[617]/xObject[0]/contentStream[0](2113 0 obj PDSemanticContentStream)/operators[10]/font[0](ArialMT)",
      "Page 117 › Drawing step 618 › Embedded graphic › Drawing step 11 › Font ArialMT",
    ],
    [
      "root/document[0]/pages[3](11 0 obj PDPage)/annots[1](22 0 obj PDInkAnnot)",
      "Page 4 › Annotation 2",
    ],
    [
      "root/document[0]/StructTreeRoot[0](33 0 obj PDStructTreeRoot)/K[0](34 0 obj SEDocument Document)/K[0](41 0 obj SEFigure Figure)",
      "Tag tree › Document tag › Figure tag",
    ],
    [
      "root/document[0]/metadata[0](102 0 obj PDMetadata)/XMPPackage[0]/Properties[10](http://purl.org/dc/elements/1.1/ - dc:title)",
      "Document metadata › Title",
    ],
    ["root/document[0]/Outlines[0](outline 2570 0)", "Bookmarks"],
    ["root/document[0]", "Whole document"],
    ["root", "Whole document"],
  ])("%s", (context, expected) => {
    expect(describeLocation(t, wrap(context))).toBe(expected);
  });

  it("accepts a bare context without veraPDF's wrapper", () => {
    expect(
      describeLocation(t, "root/document[0]/pages[4](13 0 obj PDPage)"),
    ).toBe("Page 5");
  });
});
