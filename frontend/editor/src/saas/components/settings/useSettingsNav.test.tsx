import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({
  owner: true,
  loading: false,
  portalAccess: false,
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, signOut: vi.fn() }),
}));
vi.mock("@app/contexts/SaaSTeamContext", () => ({
  useSaaSTeam: () => ({ isTeamLeader: state.owner, loading: state.loading }),
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: state.portalAccess, settled: true }),
}));
vi.mock("@app/auth/supabase", () => ({ isUserAnonymous: () => false }));
vi.mock("@app/components/shared/config/configSections/Overview", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/config/saasConfigNavSections", () => ({
  createSaasConfigNavSections: () => [
    {
      title: "Legal",
      items: [{ key: "legal", label: "Legal", icon: "gavel", component: null }],
    },
  ],
}));
vi.mock("@app/components/settings/portalSettingsNav", () => ({
  buildPortalSettingsSections: () => [
    {
      id: "workspace",
      title: "Workspace",
      items: [
        {
          key: "billing",
          label: "Billing",
          icon: "credit-card",
          component: null,
        },
      ],
    },
  ],
  PORTAL_SECTION_ALIASES: {},
  portalSupersededSectionKeys: () => [],
}));

import { useSettingsNav } from "@app/components/settings/useSettingsNav";

describe("Connected instances settings navigation", () => {
  beforeEach(() => {
    state.owner = true;
    state.loading = false;
    state.portalAccess = false;
  });

  it.each([false, true])(
    "offers management to owners with Processor access = %s",
    (portalAccess) => {
      state.portalAccess = portalAccess;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      expect(
        result.current.sections
          .flatMap((section) => section.items)
          .filter((item) => item.key === "account-link"),
      ).toHaveLength(1);
    },
  );

  it.each([false, true])(
    "sends retired Preferences rows to their new home with Processor access = %s",
    (portalAccess) => {
      state.portalAccess = portalAccess;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      expect(result.current.aliases?.hotkeys).toBe("general");
      expect(result.current.aliases?.account).toBe("overview");
    },
  );

  it.each([false, true])(
    "routes retired license links to the Legal page with Processor access = %s",
    (portalAccess) => {
      state.portalAccess = portalAccess;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      const availableKeys = result.current.sections.flatMap((section) =>
        section.items.map((item) => item.key),
      );

      for (const retiredKey of [
        "backendThirdPartyLicenses",
        "frontendThirdPartyLicenses",
      ]) {
        const target = result.current.aliases?.[retiredKey];
        expect(target).toBe("legal");
        expect(availableKeys).toContain(target);
      }
    },
  );

  it.each([
    { owner: false, loading: false },
    { owner: true, loading: true },
  ])(
    "hides management until ownership is established: %o",
    ({ owner, loading }) => {
      state.owner = owner;
      state.loading = loading;
      const { result } = renderHook(() => useSettingsNav(vi.fn()));
      expect(
        result.current.sections
          .flatMap((section) => section.items)
          .some((item) => item.key === "account-link"),
      ).toBe(false);
    },
  );
});
