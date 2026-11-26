import { describe, expect, it } from "vitest";
import { defaultParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import {
  addPageNumbersFromApiParams,
  addPageNumbersToApiParams,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersOperation";

describe("page number format mapping", () => {
  it.each([
    "roman-lowercase",
    "roman-uppercase",
    "alpha-lowercase",
    "alpha-uppercase",
  ] as const)("sends the selected %s format", (numberFormat) => {
    const apiParams = addPageNumbersToApiParams({
      ...defaultParameters,
      numberFormat,
    });

    expect(apiParams.numberFormat).toBe(numberFormat);
  });

  it("restores the selected Roman numeral format", () => {
    const params = addPageNumbersFromApiParams({
      fontType: "times",
      numberFormat: "roman-uppercase",
    });

    expect(params.numberFormat).toBe("roman-uppercase");
  });
});
