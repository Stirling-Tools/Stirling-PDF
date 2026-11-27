import { describe, expect, it } from "vitest";
import {
  fileNameWithoutExtension,
  formatPageNumberLabel,
  getPageNumberLabelStyle,
  getPageNumberPlacement,
} from "@editor/components/tools/addPageNumbers/pageNumberLabel";

describe("formatPageNumberLabel", () => {
  it("prints just the number when the custom text is blank", () => {
    expect(formatPageNumberLabel("", { n: 4, zeroPad: 0 })).toBe("4");
  });

  it("fills every variable the backend accepts", () => {
    expect(
      formatPageNumberLabel("{filename} page {n} of {total}, {n}", {
        n: 2,
        zeroPad: 0,
        total: 12,
        filename: "referral",
      }),
    ).toBe("referral page 2 of 12, 2");
  });

  it("zero-pads the number but not the total", () => {
    expect(
      formatPageNumberLabel("ABC{n}/{total}", {
        n: 123,
        zeroPad: 6,
        total: 9,
      }),
    ).toBe("ABC000123/9");
  });

  it("leaves variables it has no value for as typed", () => {
    expect(
      formatPageNumberLabel("{filename}: {n} of {total}", {
        n: 1,
        zeroPad: 0,
      }),
    ).toBe("{filename}: 1 of {total}");
  });

  it("keeps a $ in the file name literal", () => {
    expect(
      formatPageNumberLabel("{filename}", {
        n: 1,
        zeroPad: 0,
        filename: "costs $& fees",
      }),
    ).toBe("costs $& fees");
  });
});

describe("fileNameWithoutExtension", () => {
  it.each([
    ["referral.pdf", "referral"],
    ["v1.2 notes.pdf", "v1.2 notes"],
    ["README", "README"],
    [".hidden", ".hidden"],
  ])("%s -> %s", (name, expected) => {
    expect(fileNameWithoutExtension(name)).toBe(expected);
  });
});

describe("getPageNumberPlacement", () => {
  it.each([
    [1, "left", "top"],
    [2, "center", "top"],
    [3, "right", "top"],
    [4, "left", "middle"],
    [5, "center", "middle"],
    [6, "right", "middle"],
    [7, "left", "bottom"],
    [8, "center", "bottom"],
    [9, "right", "bottom"],
  ] as const)("position %i is %s %s", (position, horizontal, vertical) => {
    expect(getPageNumberPlacement(position, "medium")).toMatchObject({
      horizontal,
      vertical,
    });
  });

  it("clamps out-of-range positions like the backend", () => {
    expect(getPageNumberPlacement(0, "medium")).toMatchObject({
      horizontal: "left",
      vertical: "top",
    });
    expect(getPageNumberPlacement(12, "medium")).toMatchObject({
      horizontal: "right",
      vertical: "bottom",
    });
  });

  it.each([
    ["small", 0.02],
    ["medium", 0.035],
    ["large", 0.05],
    ["x-large", 0.075],
  ] as const)("uses the backend's %s margin", (margin, factor) => {
    expect(getPageNumberPlacement(9, margin).margin).toBe(factor);
  });
});

describe("getPageNumberLabelStyle", () => {
  it("pins a bottom-right label to the margin from the right and bottom edges", () => {
    const style = getPageNumberLabelStyle(
      getPageNumberPlacement(9, "medium"),
      "Helvetica",
      6,
    );
    expect(style).toMatchObject({
      right: "3.5%",
      bottom: "calc(3.5% - 0.24em)",
      fontSize: "6px",
    });
    expect(style.left).toBeUndefined();
    expect(style.top).toBeUndefined();
    expect(style.transform).toBeUndefined();
  });

  it("centres a top-centre label on the page width", () => {
    expect(
      getPageNumberLabelStyle(getPageNumberPlacement(2, "small"), "Times", 8),
    ).toMatchObject({
      left: "50%",
      top: "2%",
      transform: "translate(-50%, 0)",
    });
  });

  it("centres the middle row on the page height", () => {
    expect(
      getPageNumberLabelStyle(getPageNumberPlacement(4, "large"), "Courier", 8),
    ).toMatchObject({
      left: "5%",
      top: "50%",
      transform: "translate(0, -50%)",
    });
  });
});
