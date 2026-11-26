import { describe, expect, test } from "vitest";
import { shouldRefitOnResize } from "@editor/components/viewer/refitOnResize";

describe("shouldRefitOnResize", () => {
  test("keeps a zoomed-in page when a sidebar narrows the area", () => {
    expect(
      shouldRefitOnResize({
        fitting: false,
        before: 1000,
        after: 760,
        widestPage: 1600,
      }),
    ).toBe(false);
  });

  test("refits a page the narrowing cut off", () => {
    expect(
      shouldRefitOnResize({
        fitting: false,
        before: 1000,
        after: 760,
        widestPage: 900,
      }),
    ).toBe(true);
  });

  test("leaves a page that still fits the narrowed area", () => {
    expect(
      shouldRefitOnResize({
        fitting: false,
        before: 1000,
        after: 760,
        widestPage: 600,
      }),
    ).toBe(false);
  });

  test("leaves a chosen zoom alone when the area widens", () => {
    expect(
      shouldRefitOnResize({
        fitting: false,
        before: 760,
        after: 1000,
        widestPage: 900,
      }),
    ).toBe(false);
  });

  test("always refits while fitting to width", () => {
    expect(
      shouldRefitOnResize({
        fitting: true,
        before: 760,
        after: 1000,
        widestPage: 700,
      }),
    ).toBe(true);
  });
});
