import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({
  owner: true,
  loading: false,
  portal: true,
  roster: true,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { isAdmin: true } }),
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({
    isAdmin: true,
    user: { orgOwner: state.owner },
    loading: state.loading,
  }),
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: state.portal, settled: true }),
}));
vi.mock("@app/hooks/useRosterAvailable", () => ({
  useRosterAvailable: () => state.roster,
}));
vi.mock("@core/components/settings/useSettingsNav", () => ({
  useSettingsNav: () => ({
    sections: [
      {
        id: "workspace",
        title: "Workspace",
        items: [
          { key: "plan", label: "Plan", component: null },
          { key: "adminPlan", label: "Legacy plan", component: null },
        ],
      },
      {
        id: "monitoring",
        title: "Monitoring",
        items: [
          { key: "adminUsage", label: "Usage Analytics", component: null },
        ],
      },
    ],
    aliases: {},
  }),
}));
vi.mock("@app/routes/hasPortal", () => ({ HAS_PORTAL: true }));

import { useSettingsNav } from "@app/components/settings/useSettingsNav";

describe("self-hosted owner settings", () => {
  beforeEach(() => {
    state.owner = true;
    state.loading = false;
    state.portal = true;
    state.roster = true;
  });

  it.each([false, true])(
    "keeps operational analytics for admins with ownership=%s",
    (owner) => {
      state.owner = owner;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      const keys = result.current.sections.flatMap((section) =>
        section.items.map((item) => item.key),
      );
      expect(keys).toContain("adminUsage");
      expect(keys).toContain("users");
      expect(keys.includes("billing")).toBe(owner);
      expect(keys.includes("account-link")).toBe(owner);
      expect(keys).not.toContain("adminPlan");
      expect(keys).not.toContain("plan");
      expect(result.current.aliases?.plan).toBe(owner ? "billing" : undefined);
      expect(result.current.aliases?.adminPlan).toBe(
        owner ? "billing" : undefined,
      );
    },
  );

  it("updates the available URL targets when ownership transfers", () => {
    const { result, rerender } = renderHook(() => useSettingsNav(vi.fn()));
    const keys = () =>
      result.current.sections.flatMap((section) =>
        section.items.map((item) => item.key),
      );
    expect(keys()).toContain("billing");
    expect(result.current.aliases?.plan).toBe("billing");
    state.owner = false;
    rerender();
    expect(result.current.aliases?.plan).toBeUndefined();
    expect(result.current.aliases?.adminPlan).toBeUndefined();
    expect(keys()).not.toContain("billing");
    expect(keys()).not.toContain("account-link");
    expect(keys()).not.toContain("adminPlan");
    expect(keys()).toContain("adminUsage");
    state.owner = true;
    rerender();
    expect(keys()).toContain("billing");
    expect(keys()).toContain("account-link");
  });

  it.each([false, true])(
    "retires the legacy Plan URL without processor sections for ownership=%s",
    (owner) => {
      state.owner = owner;
      state.portal = false;
      state.roster = false;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      const keys = result.current.sections.flatMap((section) =>
        section.items.map((item) => item.key),
      );
      expect(keys).not.toContain("adminPlan");
      expect(keys).toContain("adminUsage");
      expect(keys).not.toContain("billing");
    },
  );

  it("waits for ownership to settle before resolving a settings bookmark", () => {
    state.loading = true;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    expect(result.current.pending).toBe(true);
    expect(
      result.current.sections
        .flatMap((section) => section.items)
        .some((item) => ["billing", "adminPlan", "plan"].includes(item.key)),
    ).toBe(false);
  });
});
