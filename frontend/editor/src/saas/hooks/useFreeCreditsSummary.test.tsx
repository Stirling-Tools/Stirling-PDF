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
});
