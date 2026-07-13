import { describe, expect, test } from "vitest";
import { describeToolOperation } from "@app/hooks/tools/shared/toolOperationDescriptor";

interface Params {
  a: number;
}

const CONFIG = {
  defaultParameters: { a: 1 } satisfies Params,
  // A minimal bidirectional mapping for the flatten endpoint (arbitrary choice; the mappers here
  // just have to be present and type-check against that endpoint's model).
  toApiParams: (p: Params) => ({ renderDpi: p.a }),
  fromApiParams: (api: { renderDpi?: number }) => ({ a: api.renderDpi ?? 0 }),
};

describe("describeToolOperation", () => {
  test("wraps the config's mappers and endpoint into a descriptor", () => {
    const d = describeToolOperation("/api/v1/misc/flatten", CONFIG);
    expect(d.endpoint).toBe("/api/v1/misc/flatten");
    expect(d.toApi({ a: 200 })).toEqual({ renderDpi: 200 });
  });

  test("fromApi merges the mapped values over the defaults", () => {
    const d = describeToolOperation("/api/v1/misc/flatten", CONFIG);
    // renderDpi maps to `a`; any field the mapper omits keeps its default.
    expect(d.fromApi({ renderDpi: 72 })).toEqual({ a: 72 });
  });

  test("throws when the config lacks a mapper", () => {
    expect(() =>
      describeToolOperation("/api/v1/misc/flatten", {
        defaultParameters: { a: 1 },
        toApiParams: (p: Params) => ({ renderDpi: p.a }),
      }),
    ).toThrow(/mappers/);
  });
});
