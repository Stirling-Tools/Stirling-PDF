import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAccountMenuShortcuts } from "@app/components/shared/quickNav/useAccountMenuShortcuts";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  isAnonymous: false,
  portalAccess: false,
  isAdmin: false,
  enableLogin: true,
  orgOwner: false,
}));
vi.mock("@app/routes/hasPortal", () => ({ HAS_PORTAL: true }));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    user: state.user && { ...state.user, orgOwner: state.orgOwner },
    isAdmin: state.isAdmin,
    isAnonymous: state.isAnonymous,
    portalAccess: state.portalAccess,
  }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { isAdmin: state.isAdmin, enableLogin: state.enableLogin },
  }),
}));

function shortcutIds() {
  return renderHook(() => useAccountMenuShortcuts()).result.current.map(
    (s) => s.id,
  );
}

describe("self-hosted account menu shortcuts", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.isAnonymous = false;
    state.portalAccess = false;
    state.isAdmin = false;
    state.enableLogin = true;
    state.orgOwner = false;
  });

  it("gives a signed-in admin the server pages", () => {
    state.isAdmin = true;
    expect(shortcutIds()).toEqual(["account", "users", "server", "plan"]);
  });

  it("swaps Plan for Usage & Billing where settings does: the owner with processor access", () => {
    state.isAdmin = true;
    state.portalAccess = true;
    expect(shortcutIds()).toContain("plan");

    state.orgOwner = true;
    const ids = shortcutIds();
    expect(ids).toContain("billing");
    expect(ids).not.toContain("plan");
  });

  it("gives a regular user their account and keys", () => {
    expect(shortcutIds()).toEqual(["account", "api-keys"]);
  });

  it("adds the roster for processor access without making them an admin", () => {
    state.portalAccess = true;
    expect(shortcutIds()).toEqual(["account", "users", "api-keys"]);
  });

  it("offers no admin pages with login off, where settings disables them all", () => {
    state.enableLogin = false;
    state.isAdmin = true;
    state.isAnonymous = true;
    expect(shortcutIds()).toEqual(["preferences", "about"]);
  });
});
