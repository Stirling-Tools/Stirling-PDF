import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFleetStats } from "@portal/queries/infrastructure";
import { fetchFleetStats } from "@portal/api/fleetStats";

const state = vi.hoisted(() => ({
  auth: {
    loading: false,
    error: null as Error | null,
    session: {} as object | null,
    user: { id: "admin" } as { id: string } | null,
    isAdmin: true,
    isAnonymous: false,
  },
  json: vi.fn(),
}));

vi.mock("@app/auth/UseSession", () => ({ useAuth: () => state.auth }));
vi.mock("@portal/api/http", () => ({
  apiClient: { local: { json: state.json }, saas: { json: state.json } },
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useFleetStats(), { wrapper }) };
}

beforeEach(() => {
  state.auth = {
    loading: false,
    error: null,
    session: {},
    user: { id: "admin" },
    isAdmin: true,
    isAnonymous: false,
  };
  state.json.mockReset().mockResolvedValue({
    editorsDeployed: 4,
    activeThisMonth: 2,
    pdfsProcessed: 12,
  });
});

describe("fleet statistics access", () => {
  it.each([
    { loading: true },
    { isAdmin: false },
    { isAdmin: undefined },
    { session: null },
    { user: null },
    { isAnonymous: true },
    { error: new Error("Session unavailable") },
  ])(
    "does not request statistics for an unconfirmed admin: %j",
    async (override) => {
      Object.assign(state.auth, override);
      const { result, client } = setup();
      await act(async () => {
        await client.invalidateQueries();
      });
      expect(state.json).not.toHaveBeenCalled();
      expect(result.current).toEqual({
        data: null,
        loading: false,
        error: null,
      });
    },
  );

  it("starts only after admin authentication resolves", async () => {
    state.auth.loading = true;
    const { result, rerender } = setup();
    expect(state.json).not.toHaveBeenCalled();
    state.auth.loading = false;
    rerender();
    await waitFor(() => expect(result.current.data?.editorsDeployed).toBe(4));
    expect(state.json).toHaveBeenCalledTimes(1);
  });

  it("hides cached statistics and stops refetching after access is revoked", async () => {
    const { result, rerender, client } = setup();
    await waitFor(() => expect(result.current.data?.editorsDeployed).toBe(4));
    state.auth.isAdmin = false;
    rerender();
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(result.current.data).toBeNull();
    expect(state.json).toHaveBeenCalledTimes(1);
  });

  it("does not reuse another account's cached statistics", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.data?.editorsDeployed).toBe(4));
    state.json.mockResolvedValue({
      editorsDeployed: 1,
      activeThisMonth: 0,
      pdfsProcessed: 0,
    });
    state.auth.user = { id: "another-admin" };
    rerender();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.editorsDeployed).toBe(1));
  });

  it.each([401, 403, 404, 500])(
    "keeps optional statistics quiet on HTTP %i",
    async (status) => {
      state.json.mockRejectedValue(
        Object.assign(new Error("Unavailable"), { status }),
      );
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current).toEqual({
        data: null,
        loading: false,
        error: null,
      });
      expect(state.json).toHaveBeenCalledTimes(1);
    },
  );

  it("requires direct API callers to opt into the request", async () => {
    expect(await fetchFleetStats(false)).toBeNull();
    expect(state.json).not.toHaveBeenCalled();
  });
});
