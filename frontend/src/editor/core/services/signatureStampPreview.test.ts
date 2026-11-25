import { describe, expect, test } from "vitest";
import {
  formatStampDate,
  layoutStamp,
  stampDetails,
  textLines,
  watermarkRect,
} from "@editor/services/signatureStampPreview";

const halfEm = (line: string) => line.length * 0.5;
const details = [
  "Digitally signed by Ada",
  "Date: 2026.11.24 10:12:05 +00'00'",
];

describe("layoutStamp", () => {
  test("a wide box puts the name left and the details right", () => {
    const layout = layoutStamp(200, 50, "Ada", 0, details, halfEm);
    expect(layout.logo).toBeNull();
    expect(layout.name!.lefts[0]).toBeCloseTo(2);
    expect(layout.details.lefts[0]).toBeCloseTo(101);
    expect(layout.name!.fontSize).toBeGreaterThan(layout.details.fontSize);
  });

  test("a tall box puts the graphic above the details", () => {
    const layout = layoutStamp(80, 200, "Ada", 0, details, halfEm);
    const nameBottom = layout.name!.baselines.at(-1)!;
    const detailsTop = layout.details.baselines[0] + layout.details.fontSize;
    expect(nameBottom).toBeGreaterThan(detailsTop);
  });

  test("a logo replaces the name and keeps its shape", () => {
    const layout = layoutStamp(200, 50, "Ada", 3, details, halfEm);
    expect(layout.name).toBeNull();
    expect(layout.logo!.width / layout.logo!.height).toBeCloseTo(3);
    expect(layout.logo!.x + layout.logo!.width).toBeLessThanOrEqual(
      layout.details.lefts[0],
    );
  });

  test("a word wider than its half breaks between characters", () => {
    const name = "山田太郎山田太郎山田太郎山田太郎山田太郎";
    const layout = layoutStamp(120, 120, name, 0, details, halfEm);
    expect(layout.name!.lines.length).toBeGreaterThan(1);
    expect(layout.name!.lines.join("")).toBe(name);
  });

  test("a Latin word is never split mid-word", () => {
    const name =
      "Maximilian Alexander Featherstonehaugh-Cholmondeley the Third";
    const layout = layoutStamp(200, 50, name, 0, details, halfEm);
    const words = name.split(" ");
    for (const line of layout.name!.lines) {
      expect(line.split(" ").every((word) => words.includes(word))).toBe(true);
    }
    expect(layout.name!.lines).toContain("Featherstonehaugh-Cholmondeley");
  });

  test("a right-to-left line aligns right", () => {
    const layout = layoutStamp(
      200,
      50,
      "Ada",
      0,
      ["\u05EA\u05D0\u05E8\u05D9\u05DA: 2026", "Date: 2026"],
      halfEm,
    );
    const end =
      layout.details.lefts[0] +
      halfEm(layout.details.lines[0]) * layout.details.fontSize;
    expect(end).toBeCloseTo(198);
    expect(layout.details.lefts[1]).toBeCloseTo(101);
  });

  test("a line wrapped from a right-to-left paragraph stays right-aligned", () => {
    const hebrew =
      "\u05EA\u05D0\u05E8\u05D9\u05DA: 2026.11.24 16:22:50 +02'00'";
    const layout = layoutStamp(120, 120, "Ada", 0, [hebrew], halfEm);
    const { details: block } = layout;
    expect(block.lines.length).toBeGreaterThan(1);
    block.lines.forEach((line, index) => {
      expect(block.lefts[index] + halfEm(line) * block.fontSize).toBeCloseTo(
        115.2,
      );
    });
  });

  test("with no graphic the details fill the box", () => {
    const layout = layoutStamp(200, 50, null, 0, details, halfEm);
    expect(layout.logo).toBeNull();
    expect(layout.name).toBeNull();
    expect(layout.details.lefts[0]).toBeCloseTo(2);
  });

  test("the watermark is centred and keeps its shape", () => {
    // Same expectation as StampLayoutTest.theWatermarkIsCentredAndKeepsItsShape.
    const mark = watermarkRect(200, 50, 1);
    expect(mark.width).toBeCloseTo(46);
    expect(mark.x).toBeCloseTo(77);
    expect(mark.y).toBeCloseTo(2);
  });

  test("matches the server on the same inputs", () => {
    // Same inputs and expected sizes as StampLayoutTest, so the two layouts stay in step.
    const layout = layoutStamp(200, 50, "Ada", 0, details, halfEm);
    expect(layout.details.fontSize).toBeCloseTo(9.73, 2);
    expect(layout.name!.fontSize).toBeCloseTo(46, 2);
  });
});

describe("stampDetails", () => {
  const labels = {
    signedByLabel: "Digitally signed by {name}",
    dateLabel: "Date:",
    reasonLabel: "Reason:",
    locationLabel: "Location:",
  };

  test("labels each line as the server does", () => {
    expect(
      stampDetails(labels, {
        name: "Ada",
        date: new Date("2026-11-24T10:12:05Z"),
        timeZone: "UTC",
        reason: "Approved\nby the board",
        location: "Leeds",
      }),
    ).toEqual([
      "Digitally signed by Ada",
      "Reason: Approved",
      "by the board",
      "Location: Leeds",
      "Date: 2026.11.24 10:12:05 +00'00'",
    ]);
  });

  test("puts the certificate's distinguished name under the signer", () => {
    expect(
      stampDetails(labels, {
        name: "Ada",
        date: new Date("2026-11-24T10:12:05Z"),
        timeZone: "UTC",
        reason: "",
        location: "",
        subject: "CN=Ada, O=Example Ltd, C=GB",
      }),
    ).toEqual([
      "Digitally signed by Ada",
      "DN: CN=Ada, O=Example Ltd, C=GB",
      "Date: 2026.11.24 10:12:05 +00'00'",
    ]);
  });

  test("starts each sentence of the reason on a new line", () => {
    expect(
      stampDetails(labels, {
        name: "Ada",
        date: new Date("2026-11-24T10:12:05Z"),
        timeZone: "UTC",
        reason: "Reviewed. Approved for release, e.g. version 2.",
        location: "St. Albans",
      }).slice(1, 4),
    ).toEqual([
      "Reason: Reviewed.",
      "Approved for release, e.g. version 2.",
      "Location: St. Albans",
    ]);
  });

  test("leaves out an empty reason and location", () => {
    expect(
      stampDetails(labels, {
        name: "Ada",
        date: new Date("2026-11-24T10:12:05Z"),
        timeZone: "UTC",
        reason: "  ",
        location: "",
      }),
    ).toHaveLength(2);
  });
});

describe("textLines", () => {
  test("splits on line breaks and drops blank lines", () => {
    expect(textLines("Line one\r\n\nLine two\t!")).toEqual([
      "Line one",
      "Line two !",
    ]);
  });
});

describe("formatStampDate", () => {
  test("writes the date with the zone's offset", () => {
    const date = new Date("2026-11-24T10:12:05Z");
    expect(formatStampDate(date, "UTC")).toBe("2026.11.24 10:12:05 +00'00'");
    expect(formatStampDate(date, "Asia/Kolkata")).toBe(
      "2026.11.24 15:42:05 +05'30'",
    );
    expect(formatStampDate(date, "America/New_York")).toBe(
      "2026.11.24 05:12:05 -05'00'",
    );
  });
});
