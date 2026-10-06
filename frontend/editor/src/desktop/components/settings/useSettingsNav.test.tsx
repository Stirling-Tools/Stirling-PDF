import { beforeEach, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  useSettingsNav,
  type SettingsNav,
} from "@app/components/settings/useSettingsNav";
import DesktopGeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import type { PreferencesSectionProps } from "@core/components/shared/config/configSections/preferences/PreferencesSection";

const state = vi.hoisted(() => ({
  mode: "saas",
  authenticated: true,
  roster: false,
  owner: false,
  loading: false,
  connectionFails: false,
  workspace: true,
  loginEnabled: false,
  admin: true,
}));
const ProprietaryPreferences = vi.hoisted(
  () => (_props: { accountSlot?: string }) => null,
);
vi.mock("@proprietary/components/shared/config/configNavSections", () => ({
  useConfigNavSections: (
    _isAdmin: boolean,
    _runningEE: boolean,
    loginEnabled: boolean,
  ) => [
    {
      id: "preferences",
      title: "Preferences",
      items: [
        {
          key: "general",
          label: "Preferences",
          // Stands in for proprietary's PreferencesSection and its account cards.
          component: (
            <ProprietaryPreferences
              accountSlot={loginEnabled ? "account-cards" : undefined}
            />
          ),
        },
      ],
    },
    ...(state.workspace
      ? [
          {
            id: "workspace",
            title: "Workspace",
            items: [
              { key: "users", label: "Users", component: null },
              { key: "plan", label: "Old plan", component: null },
              { key: "adminPlan", label: "Old admin plan", component: null },
            ],
          },
        ]
      : []),
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
    getCurrentMode: async () => {
      if (state.connectionFails)
        throw new Error("Connection config unavailable");
      return state.mode;
    },
    getCachedMode: () => (state.connectionFails ? null : state.mode),
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
  useAppConfig: () => ({
    config: { isAdmin: true, enableLogin: state.loginEnabled },
  }),
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({
    isAdmin: state.admin,
    user: { orgOwner: state.owner },
    loading: state.loading,
  }),
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

beforeEach(() => {
  state.mode = "saas";
  state.authenticated = true;
  state.roster = false;
  state.owner = false;
  state.loading = false;
  state.connectionFails = false;
  state.workspace = true;
  state.loginEnabled = false;
  state.admin = true;
});

function preferencesPage(sections: SettingsNav["sections"]) {
  const item = sections
    .flatMap((group) => group.items)
    .find((entry) => entry.key === "general");
  return item?.component as ReactElement<PreferencesSectionProps>;
}

it("keeps proprietary's account cards on the desktop Preferences page when self-hosted", async () => {
  state.mode = "selfhosted";
  state.loginEnabled = true;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const page = preferencesPage(result.current.sections);
  expect(page.type).toBe(DesktopGeneralSection);
  expect(page.props.accountSlot).toBe("account-cards");
});

it.each(["saas", "local"])(
  "drops the self-hosted account cards in mode=%s",
  async (mode) => {
    state.mode = mode;
    state.loginEnabled = true;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const page = preferencesPage(result.current.sections);
    expect(page.type).toBe(DesktopGeneralSection);
    expect(page.props.accountSlot).toBeUndefined();
  },
);

it.each([
  ["local", true],
  ["saas", true],
  ["selfhosted", false],
])("hides the server-setup banner in mode=%s: %s", async (mode, hidden) => {
  state.mode = mode;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  expect(preferencesPage(result.current.sections).props.hideAdminBanner).toBe(
    hidden,
  );
});

it("drops the account cards while signed out", async () => {
  state.mode = "selfhosted";
  state.loginEnabled = true;
  state.authenticated = false;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const page = preferencesPage(result.current.sections);
  expect(page.type).toBe(DesktopGeneralSection);
  expect(page.props.accountSlot).toBeUndefined();
});

it("renders the desktop Preferences page in local mode without login", async () => {
  state.mode = "local";
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const page = preferencesPage(result.current.sections);
  expect(page.type).toBe(DesktopGeneralSection);
  expect(page.props.accountSlot).toBeUndefined();
});

it("finishes loading without billing when the connection lookup fails", async () => {
  state.connectionFails = true;
  state.owner = true;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const keys = result.current.sections.flatMap((group) =>
    group.items.map((item) => item.key),
  );
  expect(keys).toContain("general");
  expect(keys).toContain("connectionMode");
  expect(keys).not.toContain("billing");
  expect(result.current.aliases?.plan).toBeUndefined();
});

it.each([false, true])(
  "keeps one Workspace group for a self-hosted owner with roster=%s",
  async (roster) => {
    state.mode = "selfhosted";
    state.owner = true;
    state.roster = roster;
    const { result, rerender } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender();
    const workspaces = result.current.sections.filter(
      (group) => group.id === "workspace",
    );
    expect(workspaces).toHaveLength(1);
    const keys = workspaces[0].items.map((item) => item.key);
    expect(keys).toContain("users");
    expect(keys.filter((key) => key === "billing")).toHaveLength(1);
  },
);

it("creates a Workspace group when the self-hosted owner has none", async () => {
  state.mode = "selfhosted";
  state.owner = true;
  state.workspace = false;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const workspaces = result.current.sections.filter(
    (group) => group.id === "workspace",
  );
  expect(workspaces).toHaveLength(1);
  expect(workspaces[0].items.map((item) => item.key)).toEqual([
    "billing",
    "account-link",
  ]);
});

it("waits for the connection before resolving an old billing bookmark", async () => {
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  expect(result.current.pending).toBe(true);
  await waitFor(() => expect(result.current.pending).toBe(false));
  expect(result.current.aliases?.plan).toBe("billing");
});

it.each([false, true])(
  "routes old Plan links to Usage & Billing with roster=%s",
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

it("offers self-hosted billing only to the current organisation owner", async () => {
  state.mode = "selfhosted";
  state.owner = true;
  const { result, rerender } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const billing = () =>
    result.current.sections
      .flatMap((group) => group.items)
      .some((item) => item.key === "billing");
  expect(billing()).toBe(true);
  expect(result.current.aliases?.plan).toBe("billing");
  state.loading = true;
  rerender();
  expect(billing()).toBe(false);
  state.loading = false;
  state.owner = false;
  rerender();
  expect(billing()).toBe(false);
  expect(result.current.aliases?.plan).toBeUndefined();
});

it("does not offer billing to a local-mode owner", async () => {
  state.mode = "local";
  state.owner = true;
  const { result } = renderHook(() => useSettingsNav(vi.fn()));
  await waitFor(() => expect(result.current.pending).toBe(false));
  expect(
    result.current.sections
      .flatMap((group) => group.items)
      .some((item) => item.key === "billing"),
  ).toBe(false);
});

it.each([false, true])(
  "retains the cloud Users entry in SaaS mode without a Spring admin role: owner=%s",
  async (owner) => {
    state.admin = false;
    state.owner = owner;
    state.loginEnabled = true;
    state.roster = true;
    state.workspace = false;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const users = result.current.sections
      .flatMap((section) => section.items)
      .filter((item) => item.key === "users");
    expect(users).toHaveLength(1);
    // The cloud factory is mocked with a null component; the lazy Spring roster
    // would have a React element, so this verifies which entry survives.
    expect(users[0].component).toBeNull();
  },
);

it.each(["selfhosted", "local"])(
  "hides Users from a non-admin in mode=%s",
  async (mode) => {
    state.mode = mode;
    state.admin = false;
    state.loginEnabled = true;
    state.roster = true;
    state.workspace = false;
    const { result } = renderHook(() => useSettingsNav(vi.fn()));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(
      result.current.sections
        .flatMap((section) => section.items)
        .some((item) => item.key === "users"),
    ).toBe(false);
  },
);
