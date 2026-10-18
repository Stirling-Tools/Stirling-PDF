import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue, AuthUser } from "@app/auth/types";
import {
  configureSupabase,
  clearSupabaseSession,
} from "@app/auth/supabase/supabaseClient";
import { getPortalQueryClient } from "@app/portal/queryClient";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";

const storageKey = "sb-boundary-reload-auth-token";
const ownerKey = "stirling.portalSaasOwner";
const generationKey = "stirling.saasSessionGeneration";
const savedGeneration = "persisted-generation";
const user: AuthUser = {
  id: "7",
  email: "owner@example.test",
  username: "owner",
  role: "ROLE_ADMIN",
  orgOwner: true,
};
const pending: AuthContextValue = {
  user: null,
  session: null,
  displayName: null,
  isAnonymous: false,
  isAdmin: false,
  portalAccess: false,
  role: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
};
const owner: AuthContextValue = {
  ...pending,
  user,
  session: { user, access_token: "local-token", expires_in: 3600 },
  loading: false,
  isAdmin: true,
  portalAccess: true,
  role: user.role,
};
const clients: SupabaseClient[] = [];
let persisted: string;

function sessionClient() {
  const client = configureSupabase({
    url: "https://boundary-reload.supabase.co",
    key: "public-test-key",
    authOptions: { autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(client);
  return client;
}

function tree(auth: AuthContextValue) {
  return (
    <StrictMode>
      <AuthContext.Provider value={auth}>
        <AccountLinkSessionBoundary>
          <span>Attended data</span>
        </AccountLinkSessionBoundary>
      </AuthContext.Provider>
    </StrictMode>
  );
}

beforeEach(() => {
  clearSupabaseSession();
  localStorage.clear();
  localStorage.setItem(ownerKey, user.id);
  localStorage.setItem(generationKey, savedGeneration);
  persisted = JSON.stringify({
    access_token: "persisted-access-token",
    refresh_token: "persisted-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "saas-owner" },
    stirlingSessionGeneration: savedGeneration,
  });
  localStorage.setItem(storageKey, persisted);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  );
});

afterEach(async () => {
  cleanup();
  clearSupabaseSession();
  await Promise.all(
    clients.splice(0).map((client) => client.auth.stopAutoRefresh()),
  );
  getPortalQueryClient().clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "preserves the owner's persisted session on reload (auth loading: %s)",
  async (loading) => {
    const view = render(tree(loading ? pending : owner));
    if (loading) expect(screen.queryByText("Attended data")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe(persisted);
    expect(localStorage.getItem(generationKey)).toBe(savedGeneration);
    view.rerender(tree(owner));
    expect(screen.getByText("Attended data")).toBeInTheDocument();
    expect(localStorage.getItem(ownerKey)).toBe(user.id);
    expect(
      (await sessionClient().auth.getSession()).data.session?.access_token,
    ).toBe("persisted-access-token");
  },
);

it("hides attended content during an identity recheck without discarding the session", async () => {
  const client = sessionClient();
  await client.auth.getSession();
  const view = render(tree(owner));
  view.rerender(tree({ ...owner, loading: true }));
  expect(screen.queryByText("Attended data")).toBeNull();
  expect(localStorage.getItem(generationKey)).toBe(savedGeneration);
  view.rerender(tree(owner));
  expect(screen.getByText("Attended data")).toBeInTheDocument();
  expect((await client.auth.getSession()).data.session?.access_token).toBe(
    "persisted-access-token",
  );
});

it.each([
  ["signed out", { ...pending, loading: false }],
  ["another owner", { ...owner, user: { ...user, id: "8" } }],
  ["non-owner", { ...owner, isAdmin: false }],
  [
    "admin after ownership transfer",
    { ...owner, user: { ...user, orgOwner: false } },
  ],
  [
    "admin without ownership information",
    { ...owner, user: { ...user, orgOwner: undefined } },
  ],
] as const)(
  "clears credentials and cached data when authentication resolves to %s",
  async (_label, auth) => {
    await sessionClient().auth.getSession();
    getPortalQueryClient().setQueryData(
      ["private-billing"],
      "previous-owner-data",
    );
    const view = render(tree(pending));
    expect(localStorage.getItem(generationKey)).toBe(savedGeneration);
    view.rerender(tree(auth));
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(localStorage.getItem(generationKey)).not.toBe(savedGeneration);
    expect(
      getPortalQueryClient().getQueryData(["private-billing"]),
    ).toBeUndefined();
    expect((await sessionClient().auth.getSession()).data.session).toBeNull();
  },
);
