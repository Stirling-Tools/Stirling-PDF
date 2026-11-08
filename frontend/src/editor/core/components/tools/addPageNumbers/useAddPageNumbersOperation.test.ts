import { describe, expect, it } from "vitest";
import { defaultParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import {
  addPageNumbersFromApiParams,
  addPageNumbersToApiParams,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersOperation";

describe("page number format mapping", () => {
  it("sends the selected Roman numeral format", () => {
    const apiParams = addPageNumbersToApiParams({
      ...defaultParameters,
      numberFormat: "roman-lowercase",
    });

    expect(apiParams.numberFormat).toBe("roman-lowercase");
  });

  it("restores the selected Roman numeral format", () => {
    const params = addPageNumbersFromApiParams({
      fontType: "times",
      numberFormat: "roman-uppercase",
    });

    expect(params.numberFormat).toBe("roman-uppercase");
  });
});
