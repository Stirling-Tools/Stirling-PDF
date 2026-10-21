import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreeCreditsSummary } from "@app/hooks/useFreeCreditsSummary";

const state = vi.hoisted(() => ({ isAnonymous: true, loading: false }));
const wallet = vi.hoisted(() => vi.fn(() => ({ wallet: null })));
const cacheWrite = vi.hoisted(() => vi.fn());
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => state }));
vi.mock("@app/hooks/useWallet", () => ({ useWallet: wallet }));
vi.mock("@app/services/navFooterCache", () => ({
  readCachedCredits: () => ({ remaining: 1000, total: 1000 }),
  writeCachedCredits: cacheWrite,
}));

describe("guest credit display", () => {
  beforeEach(() => {
    state.isAnonymous = true;
    state.loading = false;
    vi.clearAllMocks();
  });

  it("hides stale account credits and stops guest wallet polling", () => {
    const { result } = renderHook(useFreeCreditsSummary);
    expect(result.current).toBeNull();
    expect(wallet).toHaveBeenCalledWith(false);
    expect(cacheWrite).toHaveBeenCalledWith(null);
  });

  it("does not flash cached credits while authentication is loading", () => {
    state.isAnonymous = false;
    state.loading = true;
    const { result } = renderHook(useFreeCreditsSummary);
    expect(result.current).toBeNull();
    expect(wallet).toHaveBeenCalledWith(false);
  });

  it("waits for the real allowance when a guest signs up", () => {
    const { result, rerender } = renderHook(useFreeCreditsSummary);
    state.isAnonymous = false;
    rerender();
    expect(result.current).toBeNull();
    expect(wallet).toHaveBeenLastCalledWith(true);
  });

  it("restores cached credits when loading resolves to a registered user", () => {
    state.isAnonymous = false;
    state.loading = true;
    const { result, rerender } = renderHook(useFreeCreditsSummary);
    expect(result.current).toBeNull();

    state.loading = false;
    rerender();
    expect(result.current).toEqual({ remaining: 1000, total: 1000 });
    expect(wallet).toHaveBeenLastCalledWith(true);
  });

  it("discards the loading seed when auth resolves to a guest, including after signup", () => {
    state.isAnonymous = false;
    state.loading = true;
    const { result, rerender } = renderHook(useFreeCreditsSummary);

    state.loading = false;
    state.isAnonymous = true;
    rerender();
    expect(result.current).toBeNull();
    expect(cacheWrite).toHaveBeenCalledWith(null);

    state.isAnonymous = false;
    rerender();
    expect(result.current).toBeNull();
    expect(wallet).toHaveBeenLastCalledWith(true);
  });

  it("does not revive a registered user's cached credits after a guest session", () => {
    state.isAnonymous = false;
    const { result, rerender } = renderHook(useFreeCreditsSummary);
    expect(result.current).toEqual({ remaining: 1000, total: 1000 });

    state.isAnonymous = true;
    rerender();
    expect(result.current).toBeNull();

    state.isAnonymous = false;
    rerender();
    expect(result.current).toBeNull();
  });
});
