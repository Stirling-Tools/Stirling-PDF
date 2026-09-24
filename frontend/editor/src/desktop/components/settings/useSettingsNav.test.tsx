import { it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsNav } from "@app/components/settings/useSettingsNav";
const state = vi.hoisted(() => ({ roster: false }));
vi.mock("@app/components/shared/config/configNavSections", () => ({
  useConfigNavSections: () => [
    {
      title: "Plan & Billing",
      items: [{ key: "plan", label: "Plan & Billing", component: null }],
    },
  ],
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { isAdmin: true } }),
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({ isAdmin: true, user: { orgOwner: false }, loading: false }),
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: false, settled: true }),
}));
vi.mock("@app/hooks/useRosterAvailable", () => ({
  useRosterAvailable: () => state.roster,
}));
it.each([false, true])(
  "preserves desktop cloud Plan & Billing with roster=%s",
  (roster) => {
    state.roster = roster;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    expect(
      result.current.sections
        .flatMap((group) => group.items)
        .find((item) => item.key === "plan")?.label,
    ).toBe("Plan & Billing");
    expect(result.current.aliases?.plan).toBeUndefined();
  },
);
