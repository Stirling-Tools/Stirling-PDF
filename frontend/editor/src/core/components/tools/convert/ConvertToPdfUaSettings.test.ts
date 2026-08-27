import { describe, expect, test } from "vitest";
import {
  formatAltText,
  parseAltText,
} from "@app/components/tools/convert/ConvertToPdfUaSettings";

describe("PDF/UA alt-text wire format", () => {
  test("reads the key=description lines the report's keys produce", () => {
    expect(parseAltText("0:12=Bar chart\n1:3=Company logo")).toEqual({
      "0:12": "Bar chart",
      "1:3": "Company logo",
    });
  });

  test("keeps a description containing an equals sign whole", () => {
    expect(parseAltText("2:7=Flow: approval = sign-off")).toEqual({
      "2:7": "Flow: approval = sign-off",
    });
  });

  test("skips blank and malformed lines rather than inventing keys", () => {
    expect(parseAltText("\nnot-a-pair\n3:1=   \n")).toEqual({});
  });

  test("round-trips a half-typed description, spaces and all", () => {
    // Trimming here would eat the space the moment it is typed, blocking the next word.
    const typed = { "0:1": "Bar chart " };
    expect(parseAltText(formatAltText(typed))).toEqual(typed);
  });

  test("drops a description the user cleared", () => {
    expect(formatAltText({ "0:1": "Kept", "0:2": "  " })).toBe("0:1=Kept");
  });
});
