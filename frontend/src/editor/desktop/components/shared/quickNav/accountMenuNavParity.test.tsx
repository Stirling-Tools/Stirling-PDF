import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  mode: "local" as "local" | "saas" | "selfhosted",
  desktopAuthenticated: false,
  signedIn: false,
  anonymous: false,
  sessionAdmin: false,
  owner: false,
  configAdmin: false,
  enableLogin: false,
}));

function auth() {
  return {
    user: state.signedIn ? { id: "u1", orgOwner: state.owner } : null,
    isAnonymous: state.anonymous,
    isAdmin: state.sessionAdmin,
    loading: false,
    signOut: vi.fn(),
  };
}

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => null,
    getCurrentMode: async () => state.mode,
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@editor/services/authService", () => ({
  authService: {
    subscribeToAuth: (listener: (status: string) => void) => {
      listener(
        state.desktopAuthenticated ? "authenticated" : "unauthenticated",
      );
      return () => {};
    },
  },
}));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: auth }));
vi.mock("@editor/auth/context", () => ({ useAuth: auth }));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: {
      isAdmin: state.configAdmin,
      enableLogin: state.enableLogin,
      runningEE: true,
      showSettingsWhenNoLogin: true,
    },
  }),
}));
vi.mock("@editor/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: false, settled: true }),
}));
vi.mock("@editor/hooks/useRosterAvailable", () => ({
  useRosterAvailable: () => true,
}));
vi.mock(
  "@editor/components/shared/config/configSections/GeneralSection",
  () => ({ default: () => null }),
);
vi.mock("@editor/components/ConnectionSettings", () => ({
  ConnectionSettings: () => null,
}));
vi.mock("@editor/platform/openExternal", () => ({ openExternal: vi.fn() }));

const { useSettingsNav } =
  await import("@editor/components/settings/useSettingsNav");
const { useAccountMenuShortcuts } =
  await import("@editor/components/shared/quickNav/useAccountMenuShortcuts");
const { useAccountMenuState } =
  await import("@editor/components/shared/quickNav/useAccountMenuState");

async function render() {
  const { result } = renderHook(() => ({
    nav: useSettingsNav(() => {}),
    shortcuts: useAccountMenuShortcuts(),
    menu: useAccountMenuState(),
  }));
  await waitFor(() => expect(result.current.nav.pending).toBe(false));
  await waitFor(() =>
    expect(
      result.current.nav.sections.some((s) =>
        s.items.some((i) => i.key === "connectionMode"),
      ),
    ).toBe(true),
  );
  const items = result.current.nav.sections.flatMap((s) => s.items);
  const dead = result.current.shortcuts
    .map((s) => s.to.replace(/^\/settings\/([^#]+).*$/, "$1"))
    .filter((key) => {
      const item = items.find((i) => i.key === key);
      return !item || item.disabled;
    });
  return {
    ids: result.current.shortcuts.map((s) => s.id),
    dead,
    header: result.current.menu.header,
    actions: result.current.menu.actions.map((a) => a.id),
  };
}

type Role = "signedOut" | "guest" | "user" | "admin" | "owner";

function as(role: Role) {
  state.signedIn = role !== "signedOut";
  state.desktopAuthenticated = state.signedIn;
  state.anonymous = role === "guest";
  state.sessionAdmin = role === "admin" || role === "owner";
  state.owner = role === "owner";
}

interface Case {
  mode: "local" | "saas" | "selfhosted";
  role: Role;
  ids: string[];
  header?: "local" | "signedOut";
  actions: string[];
}

const cases: Case[] = [
  {
    mode: "local",
    role: "signedOut",
    ids: ["appearance", "hotkeys", "connection"],
    header: "local",
    actions: ["sign-in"],
  },
  {
    mode: "local",
    role: "user",
    ids: ["appearance", "hotkeys", "connection"],
    header: "local",
    actions: ["sign-in"],
  },
  {
    mode: "saas",
    role: "signedOut",
    ids: ["appearance", "hotkeys", "connection"],
    header: "signedOut",
    actions: ["sign-in"],
  },
  {
    mode: "saas",
    role: "guest",
    ids: ["appearance", "hotkeys", "connection"],
    header: "signedOut",
    actions: ["sign-in"],
  },
  { mode: "saas", role: "user", ids: ["users", "billing"], actions: [] },
  { mode: "saas", role: "owner", ids: ["users", "billing"], actions: [] },
  {
    mode: "selfhosted",
    role: "signedOut",
    ids: ["appearance", "hotkeys", "connection"],
    header: "signedOut",
    actions: ["sign-in"],
  },
  { mode: "selfhosted", role: "user", ids: ["api-keys"], actions: [] },
  { mode: "selfhosted", role: "admin", ids: ["users", "server"], actions: [] },
  {
    mode: "selfhosted",
    role: "owner",
    ids: ["users", "server", "billing"],
    actions: [],
  },
];

describe("desktop avatar menu links only to live settings pages", () => {
  beforeEach(() => {
    state.configAdmin = false;
    state.enableLogin = false;
  });

  for (const c of cases) {
    it(`${c.mode}, ${c.role}`, async () => {
      state.mode = c.mode;
      as(c.role);
      if (c.mode === "selfhosted") {
        state.enableLogin = true;
        state.configAdmin = state.sessionAdmin;
      } else {
        state.configAdmin = true;
      }
      const result = await render();
      expect(result.dead).toEqual([]);
      expect(result.ids).toEqual(c.ids);
      expect(result.header).toBe(c.header);
      expect(result.actions).toEqual(c.actions);
    });
  }

  it("a cloud session the desktop has not authenticated offers no cloud pages", async () => {
    state.mode = "saas";
    as("user");
    state.desktopAuthenticated = false;
    const result = await render();
    expect(result.dead).toEqual([]);
    expect(result.ids).toEqual([]);
  });

  it("a self-hosted server with login off offers preferences and the connection page", async () => {
    state.mode = "selfhosted";
    as("signedOut");
    state.configAdmin = true;
    const result = await render();
    expect(result.dead).toEqual([]);
    expect(result.ids).toEqual(["appearance", "hotkeys", "connection"]);
  });
});
