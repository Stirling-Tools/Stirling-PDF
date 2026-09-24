import { beforeEach, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSettingsNav } from "@app/components/settings/useSettingsNav";

const state = vi.hoisted(() => ({
  mode: "saas",
  authenticated: true,
  roster: false,
}));
vi.mock("@proprietary/components/shared/config/configNavSections", () => ({
  useConfigNavSections: () => [
    {
      id: "preferences",
      title: "Preferences",
      items: [{ key: "general", label: "Preferences", component: null }],
    },
    {
      id: "workspace",
      title: "Workspace",
      items: [
        { key: "plan", label: "Old plan", component: null },
        { key: "adminPlan", label: "Old admin plan", component: null },
      ],
    },
  ],
}));
vi.mock("@app/components/shared/config/configSections/GeneralSection", () => ({
  default: () => null,
}));
vi.mock("@app/components/ConnectionSettings", () => ({
  ConnectionSettings: () => null,
}));
vi.mock("@app/components/shared/config/cloudConfigNavSections", () => ({
  createCloudTeamNavItem: () => ({
    key: "users",
    label: "Users",
    component: null,
  }),
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: async () => state.mode,
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    subscribeToAuth: (listener: (status: string) => void) => {
      listener(state.authenticated ? "authenticated" : "unauthenticated");
      return () => {};
    },
  },
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
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));

beforeEach(() => {
  state.mode = "saas";
  state.authenticated = true;
  state.roster = false;
});

it("waits for the connection before resolving an old billing bookmark", async () => {
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  expect(result.current.pending).toBe(true);
  await waitFor(() => expect(result.current.pending).toBe(false));
  expect(result.current.aliases?.plan).toBe("billing");
});

it.each([false, true])(
  "routes old Plan links to web billing with roster=%s",
  async (roster) => {
    state.roster = roster;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() => expect(result.current.aliases?.plan).toBe("billing"));
    const items = result.current.sections.flatMap((group) => group.items);
    expect(items.find((item) => item.key === "billing")?.label).toBe(
      "Usage & Billing",
    );
    expect(items.some((item) => ["plan", "adminPlan"].includes(item.key))).toBe(
      false,
    );
    expect(result.current.aliases?.adminPlan).toBe("billing");
    expect(result.current.aliases?.help).toBe("about");
  },
);

it.each([
  ["local", true],
  ["selfhosted", true],
  ["saas", false],
])(
  "does not offer cloud billing for mode=%s authenticated=%s",
  async (mode, authenticated) => {
    state.mode = mode;
    state.authenticated = authenticated;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() =>
      expect(
        result.current.sections.some((group) =>
          group.items.some((item) => item.key === "connectionMode"),
        ),
      ).toBe(true),
    );
    const keys = result.current.sections.flatMap((group) =>
      group.items.map((item) => item.key),
    );
    expect(keys).not.toContain("billing");
    expect(keys).not.toContain("plan");
    expect(keys).not.toContain("adminPlan");
    expect(result.current.aliases?.plan).toBeUndefined();
  },
);
