import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { POLICY_CATEGORIES } from "@portal/api/policies";
import { STORE_CATEGORIES } from "@portal/api/store";
import {
  builtInTemplateId,
  isBuiltInStoreId,
} from "@portal/components/store/builtInIds";
import {
  builtInListing,
  builtInListings,
  filterBuiltIns,
} from "@portal/components/store/builtInListings";

// Echoes keys back, so assertions read the catalogue's own keys.
const t = ((key: string, options?: { category?: string }) =>
  options?.category ? `${options.category} Pipeline` : key) as TFunction;

describe("builtInListings", () => {
  const listings = builtInListings(t);

  it("lists every template that can be set up, and no coming-soon ones", () => {
    const expected = POLICY_CATEGORIES.filter((c) => !c.comingSoon).map(
      (c) => `stirling-${c.id}`,
    );
    expect(listings.map((l) => l.storeId)).toEqual(expected);
    expect(listings.length).toBeGreaterThan(0);
  });

  it("uses only store categories and real tool endpoints", () => {
    for (const listing of listings) {
      expect(STORE_CATEGORIES).toContain(listing.category);
      expect(listing.curated).toBe(true);
      expect(listing.tools.length).toBeGreaterThan(0);
      for (const tool of listing.tools) expect(tool).toMatch(/^\/api\/v1\//);
    }
  });

  it("never collides with a server-issued store id", () => {
    expect(isBuiltInStoreId("sp-abcd1234")).toBe(false);
    expect(isBuiltInStoreId("stirling-security")).toBe(true);
    expect(builtInTemplateId("stirling-security")).toBe("security");
    expect(builtInTemplateId("sp-abcd1234")).toBeNull();
  });

  it("resolves a listing by id, and an unknown one to nothing", () => {
    expect(builtInListing("stirling-security", t)?.category).toBe("security");
    expect(builtInListing("stirling-nope", t)).toBeNull();
  });

  it("filters by category and by query like the server", () => {
    expect(
      filterBuiltIns(listings, undefined, "security").map((l) => l.storeId),
    ).toEqual(["stirling-security"]);
    expect(
      filterBuiltIns(listings, "auto-redact", undefined).map((l) => l.storeId),
    ).toEqual(["stirling-security"]);
    expect(filterBuiltIns(listings, "stirling-security", undefined)).toEqual([
      listings.find((l) => l.storeId === "stirling-security"),
    ]);
    expect(filterBuiltIns(listings, "zzz-no-match", undefined)).toEqual([]);
  });
});
