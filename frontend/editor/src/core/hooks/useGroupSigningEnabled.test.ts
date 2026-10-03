import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGroupSigningState } from "@app/hooks/useGroupSigningEnabled";

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { storageGroupSigningEnabled: true },
    loading: false,
  }),
}));
const authState = vi.hoisted(() => ({ isAnonymous: false }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => authState }));

describe("useGroupSigningState", () => {
  beforeEach(() => {
    authState.isAnonymous = false;
  });

  it("follows the server config for an account", () => {
    const { result } = renderHook(() => useGroupSigningState());
    expect(result.current).toEqual({ enabled: true, settled: true });
  });

  it("is off for a guest", () => {
    authState.isAnonymous = true;
    const { result } = renderHook(() => useGroupSigningState());
    expect(result.current).toEqual({ enabled: false, settled: true });
  });
});
