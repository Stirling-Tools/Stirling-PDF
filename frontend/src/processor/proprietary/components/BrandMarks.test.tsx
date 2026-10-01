import { describe, expect, it } from "vitest";

import { markName } from "@portal/components/BrandMarks";
import { CREATABLE_CONNECTION_TYPES } from "@portal/components/sources/connectionTypes";
import {
  COMING_SOON_SOURCE_TYPES,
  CREATABLE_SOURCE_TYPES,
} from "@portal/components/sources/sourceTypes";

// These ids come back from the API and never appear as <Icon name> literals, so
// nothing else checks that each one has artwork. The plug is only for ids the
// app has never heard of.
describe("markName", () => {
  const ids = [
    ...CREATABLE_CONNECTION_TYPES.map((t) => t.id),
    ...CREATABLE_SOURCE_TYPES.map((t) => t.type),
    ...COMING_SOON_SOURCE_TYPES.map((t) => t.type),
  ];

  it.each([...new Set(ids)])("has a mark for %s", (id) => {
    expect(markName(id)).not.toBe("plug");
  });

  it("falls back to the plug for an unknown id", () => {
    expect(markName("no-such-connector")).toBe("plug");
    expect(markName("constructor")).toBe("plug");
  });
});
