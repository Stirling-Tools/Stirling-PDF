import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useContext } from "react";

const h = vi.hoisted(() => ({ apiBase: "/" }));

vi.mock("@app/services/apiClientConfig", () => ({
  getApiBaseUrl: () => h.apiBase,
}));

const sbSession = {
  access_token: "supabase-token",
  user: {
    id: "u1",
    email: "user@example.com",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
  },
};

vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: sbSession } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      refreshSession: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
}));

import { SupabaseAuthProvider } from "@app/auth/supabase/UseSession";
import { AuthContext } from "@app/auth/context";

function Probe() {
  const v = useContext(AuthContext);
  return (
    <>
      <span data-testid="access">{String(v?.portalAccess)}</span>
      {/* Raw, un-defaulted value: this is what SaasPortalGate reads to decide
          "access not known yet" vs "denied". undefined = spinner forever. */}
      <span data-testid="raw">{String(v?.user?.portalAccess)}</span>
    </>
  );
}

const mount = () =>
  render(
    <SupabaseAuthProvider>
      <Probe />
    </SupabaseAuthProvider>,
  );

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("supabase provider portalAccess lookup", () => {
  // SaaS serves the frontend and the API from different hosts; a root-relative
  // path silently missed /me, so a granted non-admin was denied the Processor.
  it("calls /me on the configured API base, not the page origin", async () => {
    h.apiBase = "https://api.example.com";
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { portalAccess: true } }),
    });
    mount();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/auth/me",
        expect.anything(),
      ),
    );
  });

  it("keeps a same-origin base as a single leading slash", async () => {
    h.apiBase = "/";
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { portalAccess: true } }),
    });
    mount();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/auth/me",
        expect.anything(),
      ),
    );
  });

  it("grants access when /me says so", async () => {
    h.apiBase = "https://api.example.com";
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { portalAccess: true } }),
    });
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("access").textContent).toBe("true"));
  });

  // A non-ok used to resolve to null and return early, leaving the raw
  // portalAccess undefined forever - SaasPortalGate reads that as "still
  // loading" and hangs on a spinner instead of falling back.
  it("resolves the raw portalAccess when /me returns non-ok", async () => {
    h.apiBase = "https://api.example.com";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("raw").textContent).toBe("false"));
  });

  it("leaves the raw portalAccess defined when the request rejects", async () => {
    h.apiBase = "https://api.example.com";
    fetchMock.mockRejectedValue(new Error("network down"));
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("raw").textContent).toBe("false"));
  });
});
