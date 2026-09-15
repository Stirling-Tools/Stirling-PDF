import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({ owner: true, loading: false }));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({
    isAdmin: true,
    user: { orgOwner: state.owner },
    loading: state.loading,
  }),
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: true, settled: true }),
}));
vi.mock("@core/components/settings/useSettingsNav", () => ({
  useSettingsNav: () => ({
    sections: [
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
      expect(keys.includes("billing")).toBe(owner);
      expect(keys.includes("account-link")).toBe(owner);
    },
  );

  it("updates the available URL targets when ownership transfers", () => {
    const { result, rerender } = renderHook(() => useSettingsNav(vi.fn()));
    const keys = () =>
      result.current.sections.flatMap((section) =>
        section.items.map((item) => item.key),
      );
    expect(keys()).toContain("billing");
    state.owner = false;
    rerender();
    expect(keys()).not.toContain("billing");
    expect(keys()).not.toContain("account-link");
    expect(keys()).toContain("adminUsage");
    state.owner = true;
    rerender();
    expect(keys()).toContain("billing");
    expect(keys()).toContain("account-link");
  });

  it("waits for ownership to settle before resolving a settings bookmark", () => {
    state.loading = true;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    expect(result.current.pending).toBe(true);
    expect(
      result.current.sections
        .flatMap((section) => section.items)
        .some((item) => item.key === "billing"),
    ).toBe(false);
  });
});
