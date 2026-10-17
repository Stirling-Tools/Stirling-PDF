import { describe, expect, it } from "vitest";

import { ICONS } from "@app/icons/icons";
import { ICON_NAMES } from "@app/icons/iconNames";
import {
  PLACEHOLDER_ICON_BODY,
  SELF_PAINTED_ICON_NAMES,
  STARTUP_ICON_BODIES,
} from "@app/icons/startupIcons.generated";
import { MISSING_ICON } from "@app/ui/Icon";

// Both generated files sit between `icons.ts` and the app: `iconNames.ts` lets
// `isIconName` answer exactly before the registry is fetched, and
// `startupIcons.generated.ts` carries the markup the landing screen paints.
describe("icon delivery split", () => {
  it("lists exactly the registry's names", () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICONS).sort());
  });

  it("keeps every startup icon in the registry", () => {
    const unknown = Object.keys(STARTUP_ICON_BODIES).filter(
      (n) => !ICON_NAMES.has(n),
    );
    expect(unknown).toEqual([]);
  });

  it("pins the placeholder the map falls back to", () => {
    expect(STARTUP_ICON_BODIES[MISSING_ICON]).toBe(PLACEHOLDER_ICON_BODY);
  });

  it("gives every drawing the markup the shared root will inline", () => {
    const malformed = Object.entries(STARTUP_ICON_BODIES)
      .filter(([, body]) => !body.startsWith("<") || !body.endsWith(">"))
      .map(([name]) => name);
    expect(malformed).toEqual([]);
  });

  it("marks the brand drawing self-painted, and only drawings that exist", () => {
    expect(SELF_PAINTED_ICON_NAMES.has("stirling-mark")).toBe(true);
    const unknown = [...SELF_PAINTED_ICON_NAMES].filter(
      (name) => STARTUP_ICON_BODIES[name] === undefined,
    );
    expect(unknown).toEqual([]);
  });
});
