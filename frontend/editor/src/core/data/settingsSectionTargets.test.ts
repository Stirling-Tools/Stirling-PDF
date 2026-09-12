import { describe, expect, it } from "vitest";
import { BASE_SECTION_ALIASES } from "@app/data/settingsAliases";
import { SETTINGS_SEARCH_INDEX } from "@app/data/settingsSearchIndex";

/**
 * Sections keep folding into one another, and both tables address a page by its
 * nav key. A key that stops being a row leaves the alias pointing at the wrong
 * page and the search result landing on the wrong one — invisible until someone
 * follows the link, because the URL still resolves.
 */
describe("settings section targets", () => {
  const retired = new Set(Object.keys(BASE_SECTION_ALIASES));

  it("never aliases a key to another retired key", () => {
    const chained = Object.entries(BASE_SECTION_ALIASES)
      .filter(([, target]) => !target || retired.has(target))
      .map(([key, target]) => `${key} -> ${target}`);
    expect(chained).toEqual([]);
  });

  it("never files a search row under a retired key", () => {
    const stale = SETTINGS_SEARCH_INDEX.filter((e) =>
      retired.has(e.section),
    ).map((e) => `${e.anchor} -> ${e.section}`);
    expect(stale).toEqual([]);
  });

  // A folded section becomes an anchor on the page that absorbed it, so the
  // bookmark and the search result have to arrive at the same page.
  it("sends a retired key and its anchor to the same page", () => {
    const disagreeing = SETTINGS_SEARCH_INDEX.filter(
      (e) =>
        retired.has(e.anchor) && BASE_SECTION_ALIASES[e.anchor] !== e.section,
    ).map(
      (e) =>
        `${e.anchor}: alias -> ${BASE_SECTION_ALIASES[e.anchor]}, index -> ${e.section}`,
    );
    expect(disagreeing).toEqual([]);
  });
});
