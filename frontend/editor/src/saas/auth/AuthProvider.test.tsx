import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

/**
 * Request-count tests for {@link AuthProvider}'s data loading.
 *
 * The provider used to fetch pro status, avatar metadata and the profile
 * picture from two places at once (mount-time init and the SIGNED_IN handler),
 * so a single login fetched everything twice - and Supabase re-fires SIGNED_IN
 * and TOKEN_REFRESHED on token refresh and tab-visibility wakeups, so it kept
 * happening for the life of the session. These tests pin the call counts.
 */

type AuthCallback = (event: string, session: Session | null) => void;

const rpc = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrl }));
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: AuthCallback) => onAuthStateChange(cb),
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: (...args: unknown[]) => rpc(...args),
    storage: { from: (bucket: string) => storageFrom(bucket) },
  },
  debugAuthEvents: vi.fn(),
}));

const syncOAuthAvatar = vi.fn();
const getProfilePictureMetadata = vi.fn();

vi.mock("@app/services/avatarSyncService", () => ({
  syncOAuthAvatar: (...args: unknown[]) => syncOAuthAvatar(...args),
  getProfilePictureMetadata: (...args: unknown[]) =>
    getProfilePictureMetadata(...args),
  getProviderAvatarUrl: () => null,
}));

const synchronizeUserUpgrade = vi.fn();

vi.mock("@app/services/userService", () => ({
  synchronizeUserUpgrade: (...args: unknown[]) =>
    synchronizeUserUpgrade(...args),
}));

// Imported after the mocks so the provider picks them up.
const { AuthProvider, useAuth } = await import("./UseSession");

/** Surfaces `loading` so a test can assert on it rather than on the container. */
function LoadingProbe() {
  const { loading } = useAuth();
  return <span data-testid="loading">{String(loading)}</span>;
}

const USER_ID = "11111111-2222-3333-4444-555555555555";

function makeSession(
  overrides: { token?: string; userId?: string; anonymous?: boolean } = {},
): Session {
  const user = {
    id: overrides.userId ?? USER_ID,
    email: "someone@example.com",
    is_anonymous: overrides.anonymous ?? false,
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Some One" },
  } as unknown as User;

  return {
    access_token: overrides.token ?? "token-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as unknown as Session;
}

/** Total requests the provider makes per user-data load. */
function callCounts() {
  return {
    proStatus: rpc.mock.calls.length,
    metadata: getProfilePictureMetadata.mock.calls.length,
    picture: createSignedUrl.mock.calls.length,
    avatarSync: syncOAuthAvatar.mock.calls.length,
  };
}

function renderProvider() {
  let authCallback: AuthCallback = () => {};
  onAuthStateChange.mockImplementation((cb: AuthCallback) => {
    authCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  const utils = render(
    <AuthProvider>
      <LoadingProbe />
    </AuthProvider>,
  );

  /**
   * Deliver an auth event and let its work finish. The provider defers handling
   * with setTimeout(0), so a microtask flush is not enough - without draining
   * real macrotasks these assertions would run before any refetch and pass
   * whatever the provider did.
   */
  const fire = async (event: string, s: Session | null) => {
    await act(async () => {
      authCallback(event, s);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  return { ...utils, fire };
}

describe("AuthProvider user-data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();

    rpc.mockResolvedValue({ data: true, error: null });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/avatar" },
      error: null,
    });
    getProfilePictureMetadata.mockResolvedValue(null);
    syncOAuthAvatar.mockResolvedValue(false);
    synchronizeUserUpgrade.mockResolvedValue(undefined);
    getSession.mockResolvedValue({
      data: { session: makeSession() },
      error: null,
    });
  });

  it("fetches each piece of user data exactly once on login", async () => {
    const { fire } = renderProvider();

    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());
    // The SIGNED_IN that follows a fresh login must not repeat the work.
    await fire("SIGNED_IN", makeSession());

    expect(callCounts()).toEqual({
      proStatus: 1,
      metadata: 1,
      picture: 1,
      avatarSync: 1,
    });
  });

  it("does not refetch when SIGNED_IN repeats with a new access token", async () => {
    const { fire } = renderProvider();
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());
    const before = callCounts();

    // What a tab-visibility wakeup or token refresh looks like: same user,
    // different token.
    await fire("SIGNED_IN", makeSession({ token: "token-2" }));

    expect(callCounts()).toEqual(before);
  });

  it("does not refetch on TOKEN_REFRESHED for the same identity", async () => {
    const { fire } = renderProvider();
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());
    const before = callCounts();

    await fire("TOKEN_REFRESHED", makeSession({ token: "token-3" }));

    expect(callCounts()).toEqual(before);
  });

  it("keeps loading false across repeat auth events", async () => {
    // Guards the Landing -> HomePage unmount: toggling `loading` on a wakeup
    // would tear down the tree on every tab switch.
    const { fire, getByTestId } = renderProvider();
    await waitFor(() =>
      expect(getByTestId("loading").textContent).toBe("false"),
    );

    await fire("SIGNED_IN", makeSession({ token: "token-4" }));
    expect(getByTestId("loading").textContent).toBe("false");

    await fire("TOKEN_REFRESHED", makeSession({ token: "token-5" }));
    expect(getByTestId("loading").textContent).toBe("false");

    expect(callCounts().proStatus).toBe(1);
  });

  it("clears the initial spinner without waiting for the avatar upload", async () => {
    // On a first login syncOAuthAvatar downloads, re-encodes and uploads the
    // provider image. Gating `loading` on that would stall account creation
    // behind an image upload, so it must settle in the background.
    let releaseSync = () => {};
    syncOAuthAvatar.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSync = () => resolve(false);
        }),
    );

    const { getByTestId } = renderProvider();

    await waitFor(() =>
      expect(getByTestId("loading").textContent).toBe("false"),
    );
    // The picture read chains behind the sync, so it has not run yet either.
    expect(createSignedUrl).not.toHaveBeenCalled();

    await act(async () => {
      releaseSync();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("refetches after a guest upgrade, which keeps the same user id", async () => {
    // The upgrade path is the one case where the id is unchanged but the data
    // must be reloaded - hence keying on is_anonymous, not the id alone.
    getSession.mockResolvedValue({
      data: { session: makeSession({ anonymous: true }) },
      error: null,
    });
    sessionStorage.setItem("pendingUpgrade", "true");
    sessionStorage.setItem("upgradeProvider", "google");

    const { fire } = renderProvider();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    await fire("USER_UPDATED", makeSession({ anonymous: false }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(synchronizeUserUpgrade).toHaveBeenCalledWith("google");
  });

  it("does not drop an upgrade that lands while the guest load is in flight", async () => {
    // The guest load and the upgrade overlap on a slow connection. Coalescing
    // on "something is in flight" alone would hand the upgrade the guest's
    // promise and never fetch the real user's data.
    getSession.mockResolvedValue({
      data: { session: makeSession({ anonymous: true }) },
      error: null,
    });
    sessionStorage.setItem("pendingUpgrade", "true");
    sessionStorage.setItem("upgradeProvider", "google");

    let releaseGuestLoad = () => {};
    const guestLoadBlocked = new Promise<void>((resolve) => {
      releaseGuestLoad = resolve;
    });
    rpc.mockImplementationOnce(async () => {
      await guestLoadBlocked;
      return { data: false, error: null };
    });

    const { fire } = renderProvider();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // Deliver the upgrade with the guest load still deliberately unsettled, so
    // the guard genuinely has an in-flight load to reason about.
    await fire("USER_UPDATED", makeSession({ anonymous: false }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2), {
      timeout: 1000,
    });

    // Let the abandoned guest load settle inside act, so its trailing state
    // updates do not land after the test finishes.
    await act(async () => {
      releaseGuestLoad();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("reloads for the same user after a sign-out", async () => {
    const { fire } = renderProvider();
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());

    await fire("SIGNED_OUT", null);
    await fire("SIGNED_IN", makeSession());

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  });

  it("keeps the initial spinner up when SIGNED_IN wins the race with initializeAuth", async () => {
    // initializeAuth is invoked before the listener subscribes but yields at
    // `await getSession()`, so Supabase can deliver SIGNED_IN first. Marking the
    // identity loaded up front would then let initializeAuth's await resolve
    // instantly and clear the spinner while pro status was still in flight -
    // which is the whole thing awaiting the load is meant to prevent.
    const session = makeSession();

    let releaseSession = () => {};
    getSession.mockReturnValueOnce(
      new Promise<{ data: { session: Session }; error: null }>((resolve) => {
        releaseSession = () => resolve({ data: { session }, error: null });
      }),
    );

    let releaseProStatus = () => {};
    rpc.mockImplementationOnce(
      () =>
        new Promise<{ data: boolean; error: null }>((resolve) => {
          releaseProStatus = () => resolve({ data: true, error: null });
        }),
    );

    const { getByTestId, fire } = renderProvider();

    // SIGNED_IN lands first and starts the load; pro status stays unsettled.
    await fire("SIGNED_IN", session);
    expect(rpc).toHaveBeenCalledTimes(1);

    // initializeAuth now gets its session and must adopt that in-flight load
    // rather than short-circuiting on a key that was set before the data landed.
    await act(async () => {
      releaseSession();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getByTestId("loading").textContent).toBe("true");
    // Adopted, not restarted.
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseProStatus();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() =>
      expect(getByTestId("loading").textContent).toBe("false"),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
