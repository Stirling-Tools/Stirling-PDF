import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { OPEN_SIGN_IN_EVENT } from "@editor/constants/signInEvents";

const getCurrentMode = vi.fn();
const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAnonymous: false,
  loading: false,
}));

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => null,
    getCurrentMode: () => getCurrentMode(),
    subscribeToModeChanges: () => () => {},
  },
}));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => auth }));

const { useAccountMenuState } =
  await import("@editor/components/shared/quickNav/useAccountMenuState");

async function stateIn(mode: string) {
  getCurrentMode.mockResolvedValue(mode);
  const { result } = renderHook(() => useAccountMenuState());
  await waitFor(() => expect(getCurrentMode).toHaveBeenCalled());
  return result;
}

describe("desktop account menu state", () => {
  beforeEach(() => {
    getCurrentMode.mockReset();
    auth.user = null;
    auth.isAnonymous = false;
    auth.loading = false;
  });

  it("names local mode and offers sign in", async () => {
    const result = await stateIn("local");
    await waitFor(() => expect(result.current.header).toBe("local"));
    expect(result.current.actions.map((a) => a.id)).toEqual(["sign-in"]);
  });

  it("calls a server without a session signed out, not local", async () => {
    const result = await stateIn("selfhosted");
    await waitFor(() => expect(result.current.header).toBe("signedOut"));
    expect(result.current.actions.map((a) => a.id)).toEqual(["sign-in"]);
  });

  it("treats a cloud guest as signed out", async () => {
    auth.user = { id: "guest" };
    auth.isAnonymous = true;
    const result = await stateIn("saas");
    await waitFor(() => expect(result.current.header).toBe("signedOut"));
  });

  it("leaves a signed-in account to its own header and sign out", async () => {
    auth.user = { id: "u1" };
    for (const mode of ["saas", "selfhosted"]) {
      const result = await stateIn(mode);
      await waitFor(() => expect(getCurrentMode).toHaveBeenCalled());
      expect(result.current).toEqual({ actions: [] });
    }
  });

  it("opens the desktop sign-in dialog", async () => {
    const result = await stateIn("local");
    await waitFor(() => expect(result.current.actions).toHaveLength(1));
    const opened = vi.fn();
    window.addEventListener(OPEN_SIGN_IN_EVENT, opened);
    result.current.actions[0].onSelect();
    window.removeEventListener(OPEN_SIGN_IN_EVENT, opened);
    expect(opened).toHaveBeenCalledOnce();
  });
});
