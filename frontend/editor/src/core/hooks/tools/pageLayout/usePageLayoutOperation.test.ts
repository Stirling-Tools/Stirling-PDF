import { describe, expect, test } from "vitest";
import {
  pageLayoutFromApiParams,
  pageLayoutToApiParams,
} from "@app/hooks/tools/pageLayout/usePageLayoutOperation";
import {
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

describe("pageLayout mappers", () => {
  test.each<Partial<PageLayoutParameters>>([
    {},
    { addBorder: true, borderWidth: 3, innerMargin: 5, topMargin: 2 },
  ])("round-trips backend params for %o", (overrides) => {
    const api = pageLayoutToApiParams({ ...defaultParameters, ...overrides });
    const roundTripped = pageLayoutToApiParams({
      ...defaultParameters,
      ...pageLayoutFromApiParams(api),
    });

    expect(roundTripped).toEqual(api);
  });
});
