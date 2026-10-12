import { describe, expect, test } from "vitest";
import { describeToolOperation } from "@app/hooks/tools/shared/toolOperationDescriptor";

interface Params {
  a: number;
}

// A minimal config that type-checks against the flatten endpoint's model.
const CONFIG = {
  endpoint: "/api/v1/misc/flatten" as const,
  defaultParameters: { a: 1 } satisfies Params,
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
    expect(d.fromApi({ renderDpi: 72 })).toEqual({ a: 72 });
  });

  test("throws when the config lacks a mapper", () => {
    expect(() =>
      describeToolOperation("/api/v1/misc/flatten", {
        endpoint: "/api/v1/misc/flatten" as const,
        defaultParameters: { a: 1 },
        toApiParams: (p: Params) => ({ renderDpi: p.a }),
      }),
    ).toThrow(/mappers/);
  });
});
