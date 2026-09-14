import { describe, it, expect } from "vitest";
import type {
  ConfigNavSection,
  NavKey,
} from "@app/components/shared/config/types";
import { portalSupersededSectionKeys } from "@app/components/settings/portalSettingsNav";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";

const group = (
  id: string,
  keys: NavKey[],
  mergeAt?: "lead" | "append",
): ConfigNavSection => ({
  id,
  title: id,
  mergeAt,
  items: keys.map((key) => ({ key, label: key, icon: "x", component: null })),
});

describe("portalSupersededSectionKeys", () => {
  it("retires People and Teams once the roster is served", () => {
    const keys = portalSupersededSectionKeys([group("workspace", ["users"])]);
    expect(keys).toEqual(expect.arrayContaining(["people", "teams", "users"]));
  });

  it("keeps the build's own API Keys when the processor supplies none", () => {
    // A build without the processor gets the roster but not the keys tab, and
    // dropping a key nothing replaces would delete the section outright.
    expect(
      portalSupersededSectionKeys([group("workspace", ["users"])]),
    ).not.toContain("api-keys");
  });

  it("retires the build's API Keys only when the processor's is present", () => {
    const keys = portalSupersededSectionKeys([
      group("workspace", ["users"]),
      group("preferences", ["api-keys"]),
    ]);
    expect(keys).toContain("api-keys");
  });

  it("retires legacy plan sections only when billing is present", () => {
    expect(
      portalSupersededSectionKeys([group("workspace", ["users"])]),
    ).not.toEqual(expect.arrayContaining(["plan", "adminPlan"]));

    const keys = portalSupersededSectionKeys([
      group("workspace", ["users", "billing"]),
    ]);
    expect(keys).toEqual(expect.arrayContaining(["plan", "adminPlan"]));
  });

  it("supersedes nothing when no roster was built", () => {
    expect(portalSupersededSectionKeys([])).toEqual([]);
  });
});

describe("mergeSettingsGroups", () => {
  it("drops a superseded section rather than showing both rosters", () => {
    const merged = mergeSettingsGroups(
      [group("workspace", ["people", "teams", "adminPlan"])],
      [group("workspace", ["users"])],
      portalSupersededSectionKeys([group("workspace", ["users"])]),
    );
    expect(merged[0].items.map((i) => i.key)).toEqual(["users", "adminPlan"]);
  });

  it("appends where the group asks, so an addition lands after what it joins", () => {
    const merged = mergeSettingsGroups(
      [group("preferences", ["general"])],
      [group("preferences", ["api-keys"], "append")],
      [],
    );
    expect(merged[0].items.map((i) => i.key)).toEqual(["general", "api-keys"]);
  });

  it("leads by default, so a replacement holds the place it took over", () => {
    const merged = mergeSettingsGroups(
      [group("workspace", ["people", "adminPlan"])],
      [group("workspace", ["users"])],
      ["people"],
    );
    expect(merged[0].items.map((i) => i.key)).toEqual(["users", "adminPlan"]);
  });
});
