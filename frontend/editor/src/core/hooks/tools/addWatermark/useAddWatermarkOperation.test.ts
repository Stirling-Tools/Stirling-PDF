import { describe, expect, test } from "vitest";
import {
  addWatermarkFromApiParams,
  addWatermarkToApiParams,
} from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

describe("addWatermark mappers", () => {
  // opacity 33 exercises the percentage <-> fraction conversion (/100, *100),
  // which must survive the round trip without drifting on floating point.
  test.each<Partial<AddWatermarkParameters>>([
    { watermarkType: "text", watermarkText: "DRAFT", opacity: 33 },
    { watermarkType: "image", opacity: 33 },
  ])("round-trips backend params for %o", (overrides) => {
    const api = addWatermarkToApiParams({ ...defaultParameters, ...overrides });
    const roundTripped = addWatermarkToApiParams({
      ...defaultParameters,
      ...addWatermarkFromApiParams(api),
    });

    expect(roundTripped).toEqual(api);
  });
});
