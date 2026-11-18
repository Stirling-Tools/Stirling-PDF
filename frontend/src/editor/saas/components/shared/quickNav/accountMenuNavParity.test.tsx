import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.setConfig({ testTimeout: 30_000 });

const state = vi.hoisted(() => ({
  hasPortal: true,
  anonymous: false,
  leader: false,
  portalAccess: false,
}));

vi.mock("@editor/routes/hasPortal", () => ({
  get HAS_PORTAL() {
    return state.hasPortal;
  },
}));
vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({
    user: { id: "u1", is_anonymous: state.anonymous },
    isAnonymous: state.anonymous,
    signOut: vi.fn(),
  }),
}));
vi.mock("@editor/auth/supabase", () => ({
  supabase: null,
  isUserAnonymous: (user: { is_anonymous?: boolean }) =>
    user.is_anonymous === true,
}));
vi.mock("@editor/contexts/SaaSTeamContext", () => ({
  useSaaSTeam: () => ({ isTeamLeader: state.leader, loading: false }),
}));
vi.mock("@editor/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: state.portalAccess, settled: true }),
}));
vi.mock("@editor/hooks/useFeedback", () => ({ useFeedback: () => null }));
vi.mock("@editor/components/shared/config/configSections/Overview", () => ({
  default: () => null,
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
  const dead = result.current.shortcuts
    .map((s) => s.to.replace(/^\/settings\/([^#]+).*$/, "$1"))
    .filter((key) => {
      const item = items.find((i) => i.key === key);
      return !item || item.disabled;
    });
  return { ids: result.current.shortcuts.map((s) => s.id), dead };
}

type Role = "guest" | "member" | "leader";

describe("SaaS avatar menu links only to live settings pages", () => {
  beforeEach(() => {
    state.hasPortal = true;
    state.portalAccess = false;
  });

  for (const hasPortal of [true, false]) {
    for (const portalAccess of [false, true]) {
      for (const role of ["guest", "member", "leader"] as Role[]) {
        it(`${role}, processor build=${hasPortal}, processor access=${portalAccess}`, async () => {
          state.hasPortal = hasPortal;
          state.portalAccess = portalAccess;
          state.anonymous = role === "guest";
          state.leader = role === "leader";
          const { ids, dead } = await render();
          expect(dead).toEqual([]);
          expect(ids).toEqual(
            role === "guest"
              ? ["appearance", "hotkeys"]
              : [
                  "users",
                  ...(hasPortal && portalAccess ? ["billing"] : []),
                  "api-keys",
                ],
          );
        });
      }
    }
  }
});
