import { beforeEach, describe, expect, it, vi } from "vitest";
const { clearSupabaseSession, clearQueries } = vi.hoisted(() => ({
  clearSupabaseSession: vi.fn(),
  clearQueries: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({ clearSupabaseSession }));
vi.mock("@portal/queryClient", () => ({
  getPortalQueryClient: () => ({ clear: clearQueries }),
}));
import {
  bindAccountLinkSession,
  clearAccountLinkSession,
} from "@portal/auth/accountLinkSession";
import {
  readPendingConnect,
  rememberConnect,
} from "@portal/auth/pendingConnect";

const pending = {
  ownerId: "owner",
  mode: "reauth" as const,
  returnTo: "/processor/usage",
  settingsSection: null,
  browserState: "random-state",
};

describe("local account ownership of the billing session", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("preserves the same owner's redirect through a portal reload", () => {
    bindAccountLinkSession("owner");
    rememberConnect(pending);
    vi.clearAllMocks();
    bindAccountLinkSession("owner");
    expect(readPendingConnect()).toEqual(pending);
    expect(clearSupabaseSession).not.toHaveBeenCalled();
  });

  it("[US08] preserves the session for numeric owner IDs returned by Spring", () => {
    const wireUser = JSON.parse('{"id":7,"role":"ROLE_ADMIN"}');
    localStorage.setItem("stirling.portalSaasOwner", "7");
    rememberConnect({ ...pending, ownerId: "7" });
    vi.clearAllMocks();
    bindAccountLinkSession(wireUser.id);
    expect(clearSupabaseSession).not.toHaveBeenCalled();
    expect(readPendingConnect()?.ownerId).toBe("7");
  });

  it("discards credentials, callback intent and query data when the local user changes", () => {
    bindAccountLinkSession("first");
    rememberConnect(pending);
    vi.clearAllMocks();
    bindAccountLinkSession("second");
    expect(readPendingConnect()).toBeNull();
    expect(clearSupabaseSession).toHaveBeenCalledOnce();
    expect(clearQueries).toHaveBeenCalledOnce();
  });

  it("allows a fresh link after unlinking without discarding its callback on reload", () => {
    bindAccountLinkSession("owner");
    clearAccountLinkSession();
    rememberConnect({ ...pending, mode: "link" });
    bindAccountLinkSession("owner");
    expect(readPendingConnect()?.mode).toBe("link");
  });

  it("removes callback ownership when the local user is not an organization owner", () => {
    bindAccountLinkSession("owner");
    rememberConnect(pending);
    bindAccountLinkSession(null);
    expect(localStorage.getItem("stirling.portalSaasOwner")).toBeNull();
    expect(readPendingConnect()).toBeNull();
  });
});
