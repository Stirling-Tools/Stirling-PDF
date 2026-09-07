import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { expectConsole } from "@app/tests/failOnConsole";

/**
 * Request-count tests for {@link AuthProvider}'s data loading. It used to fetch
 * pro status, avatar metadata and the picture from two places at once, and
 * Supabase re-fires SIGNED_IN on token refresh and tab wakeups, so it kept
 * happening. These pin the call counts.
 */

type AuthCallback = (event: string, session: Session | null) => void;

const rpc = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrl }));
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const supabaseSignOut = vi.fn();
const unsubscribe = vi.fn();

vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: AuthCallback) => onAuthStateChange(cb),
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      signOut: () => supabaseSignOut(),
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
const { AuthProvider, useAuth } = await import("@app/auth/UseSession");
const { writeWorkbenchSession, readWorkbenchSession, resumeWorkbenchSession } =
  await import("@app/services/workbenchSession");

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
   * Deliver an auth event and let its work finish. The provider defers with
   * setTimeout(0), so a microtask flush is not enough: without draining real
   * macrotasks the assertions run before any refetch and prove nothing.
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
    // syncOAuthAvatar re-uploads the provider image on a first login. Gating
    // `loading` on it would stall account creation behind an image upload.
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
    // Coalescing on "something is in flight" alone would hand the upgrade the
    // guest's promise and never fetch the real user's data.
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
    // initializeAuth yields at `await getSession()`, so SIGNED_IN can land
    // first. Marking the identity loaded up front would then clear the spinner
    // while pro status was still in flight.
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

    // initializeAuth must now adopt that in-flight load, not short-circuit.
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

/**
 * Signing out suspends workbench recording before the request, so a teardown cannot write the
 * record back for whoever signs in next. When the request fails the session stands, and a
 * still-signed-in user must not be left silently not recording.
 */
describe("a sign-out that fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resumeWorkbenchSession();
    getSession.mockResolvedValue({
      data: { session: makeSession() },
      error: null,
    });
    onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe } },
    }));
    rpc.mockResolvedValue({ data: null, error: null });
    getProfilePictureMetadata.mockResolvedValue(null);
    syncOAuthAvatar.mockResolvedValue(undefined);
    synchronizeUserUpgrade.mockResolvedValue(undefined);
  });

  it("leaves the workbench still being recorded", async () => {
    expectConsole.error(/\[Auth Debug\] Sign out error/);
    supabaseSignOut.mockResolvedValue({ error: new Error("network down") });

    let signOut: (() => Promise<void>) | null = null;
    function SignOutProbe() {
      signOut = useAuth().signOut;
      return null;
    }
    render(
      <AuthProvider>
        <SignOutProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(signOut).not.toBeNull());

    await act(async () => {
      await signOut!();
    });

    writeWorkbenchSession({
      fileIds: ["still-here"],
      selectedFileIds: [],
      userId: "user-a",
    });
    expect(readWorkbenchSession()?.fileIds).toEqual(["still-here"]);
  });
});
