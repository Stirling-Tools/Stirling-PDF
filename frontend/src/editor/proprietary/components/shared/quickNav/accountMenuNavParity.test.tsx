import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.setConfig({ testTimeout: 30_000 });

const state = vi.hoisted(() => ({
  hasPortal: true,
  enableLogin: true,
  configAdmin: false,
  sessionAdmin: false,
  signedIn: true,
  anonymous: false,
  owner: false,
  portalAccess: false,
  roster: true,
}));

function auth() {
  return {
    user: state.signedIn ? { id: "u1", orgOwner: state.owner } : null,
    isAnonymous: state.anonymous,
    isAdmin: state.sessionAdmin,
    loading: false,
  };
}

vi.mock("@editor/routes/hasPortal", () => ({
  get HAS_PORTAL() {
    return state.hasPortal;
  },
}));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: auth }));
vi.mock("@editor/auth/context", () => ({ useAuth: auth }));
vi.mock("@editor/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: state.portalAccess, settled: true }),
}));
vi.mock("@editor/hooks/useRosterAvailable", () => ({
  useRosterAvailable: () => state.roster,
}));
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

beforeAll(async () => {
  await import("@editor/components/settings/useSettingsNav");
  await import("@editor/components/shared/quickNav/useAccountMenuShortcuts");
}, 180_000);

async function render() {
  vi.resetModules();
  const { useSettingsNav } =
    await import("@editor/components/settings/useSettingsNav");
  const { useAccountMenuShortcuts } =
    await import("@editor/components/shared/quickNav/useAccountMenuShortcuts");
  const { result } = renderHook(() => ({
    nav: useSettingsNav(() => {}),
    shortcuts: useAccountMenuShortcuts(),
  }));
  const items = result.current.nav.sections.flatMap((s) => s.items);
  const ids = result.current.shortcuts.map((s) => s.id);
  const dead = result.current.shortcuts
    .map((s) => s.to.replace(/^\/settings\/([^#]+).*$/, "$1"))
    .filter((key) => {
      const item = items.find((i) => i.key === key);
      return !item || item.disabled;
    });
  return { ids, dead, navKeys: items.map((i) => i.key) };
}

type Role = "loginOff" | "anonymous" | "user" | "admin" | "owner";

function as(role: Role) {
  state.enableLogin = role !== "loginOff";
  state.signedIn = role !== "loginOff";
  state.anonymous = role === "anonymous";
  state.configAdmin = role === "admin" || role === "owner";
  state.sessionAdmin = state.configAdmin;
  state.owner = role === "owner";
}

describe("self-hosted avatar menu links only to live settings pages", () => {
  beforeEach(() => {
    state.hasPortal = true;
    state.portalAccess = false;
    state.roster = true;
  });

  const expected: Record<Role, Record<string, string[]>> = {
    loginOff: {
      none: ["appearance", "hotkeys"],
      portal: ["appearance", "hotkeys"],
    },
    anonymous: {
      none: ["appearance", "hotkeys"],
      portal: ["appearance", "hotkeys"],
    },
    user: { none: ["api-keys"], portal: ["api-keys"] },
    admin: { none: ["users", "server"], portal: ["users", "server"] },
    owner: {
      none: ["users", "server"],
      portal: ["users", "server", "billing"],
    },
  };

  for (const hasPortal of [true, false]) {
    for (const portalAccess of [false, true]) {
      for (const role of Object.keys(expected) as Role[]) {
        it(`${role}, processor build=${hasPortal}, processor access=${portalAccess}`, async () => {
          state.hasPortal = hasPortal;
          state.portalAccess = portalAccess;
          as(role);
          const { ids, dead } = await render();
          expect(dead).toEqual([]);
          expect(ids).toEqual(
            expected[role][hasPortal && portalAccess ? "portal" : "none"],
          );
        });
      }
    }
  }

  it("drops Users when the roster is unavailable", async () => {
    state.roster = false;
    as("owner");
    const { ids, dead } = await render();
    expect(dead).toEqual([]);
    expect(ids).toEqual(["server"]);
  });

  it("drops Users and Server for a session admin the server does not treat as admin", async () => {
    as("user");
    state.sessionAdmin = true;
    const { ids, dead } = await render();
    expect(dead).toEqual([]);
    expect(ids).toEqual(["users", "api-keys"]);
  });
});
