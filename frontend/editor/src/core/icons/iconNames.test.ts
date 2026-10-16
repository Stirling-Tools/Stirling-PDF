import { describe, expect, it } from "vitest";

import { ICONS } from "@app/icons/icons";
import { ICON_NAMES } from "@app/icons/iconNames";
import { PLACEHOLDER_ICON, STARTUP_ICONS } from "@app/icons/iconStartup";
import { MISSING_ICON } from "@app/ui/Icon";

// Both generated files sit between `icons.ts` and the app: `iconNames.ts` lets
// `isIconName` answer exactly before the registry is fetched, and
// `iconStartup.ts` carries the names the landing screen paints. They are
// written by the same script, so drift here means one of them is stale.
describe("icon delivery split", () => {
  it("lists exactly the registry's names", () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICONS).sort());
  });

  it("keeps every startup icon in the registry", () => {
    const unknown = Object.keys(STARTUP_ICONS).filter(
      (n) => !ICON_NAMES.has(n),
    );
    expect(unknown).toEqual([]);
  });

  it("pins the placeholder the map falls back to", () => {
    expect(PLACEHOLDER_ICON.Component).toBeTypeOf("function");
    expect(STARTUP_ICONS).toHaveProperty(MISSING_ICON);
  });
});
