import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { storageSharingEnabled: true, storageShareLinksEnabled: true },
  }),
}));
const authState = vi.hoisted(() => ({ isAnonymous: false }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => authState }));

describe("useSharingEnabled", () => {
  beforeEach(() => {
    authState.isAnonymous = false;
  });

  it("follows the server config for an account", () => {
    const { result } = renderHook(() => useSharingEnabled());
    expect(result.current).toEqual({
      sharingEnabled: true,
      shareLinksEnabled: true,
    });
  });

  it("is off for a guest", () => {
    authState.isAnonymous = true;
    const { result } = renderHook(() => useSharingEnabled());
    expect(result.current).toEqual({
      sharingEnabled: false,
      shareLinksEnabled: false,
    });
  });
});
