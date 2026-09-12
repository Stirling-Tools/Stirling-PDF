import { describe, expect, test } from "vitest";
import {
  defaultParameters,
  validateCropParameters,
} from "@app/hooks/tools/crop/useCropParameters";

describe("validateCropParameters", () => {
  test("accepts 'all' and valid ranges with a valid crop area", () => {
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "all",
      }),
    ).toBe(true);
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "1,3,5-8",
      }),
    ).toBe(true);
  });

  test("rejects invalid page syntax", () => {
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "abc",
      }),
    ).toBe(false);
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "2--3",
      }),
    ).toBe(false);
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "",
      }),
    ).toBe(false);
  });

  test("accepts open-range syntax", () => {
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "2-",
      }),
    ).toBe(true);
  });

  test("still validates the crop area independently of pages", () => {
    expect(
      validateCropParameters({
        ...defaultParameters,
        pageNumbers: "all",
        cropArea: { x: 0, y: 0, width: 0, height: 100 },
      }),
    ).toBe(false);
  });
});
