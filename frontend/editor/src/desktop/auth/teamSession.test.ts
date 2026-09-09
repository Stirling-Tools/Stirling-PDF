import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────
const { subscribeToAuthMock, getCurrentModeMock, subscribeToModeChangesMock } =
  vi.hoisted(() => ({
    subscribeToAuthMock: vi.fn(),
    getCurrentModeMock: vi.fn(),
    subscribeToModeChangesMock: vi.fn(),
  }));

vi.mock("@app/services/authService", () => ({
  authService: { subscribeToAuth: subscribeToAuthMock },
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: getCurrentModeMock,
    subscribeToModeChanges: subscribeToModeChangesMock,
  },
}));

import { useTeamAuth } from "@app/auth/teamSession";

/** Wire authService.subscribeToAuth to immediately report `status`. */
function withAuthStatus(status: "authenticated" | "unauthenticated") {
  subscribeToAuthMock.mockImplementation(
    (listener: (s: string, u: unknown) => void) => {
      listener(status, null);
      return () => {};
    },
  );
}

describe("useTeamAuth (desktop)", () => {
  beforeEach(() => {
    subscribeToAuthMock.mockReset();
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset();
    subscribeToModeChangesMock.mockReturnValue(() => {});
  });
  afterEach(() => vi.clearAllMocks());

  it("withholds team access until the SaaS mode is known (pessimistic default)", () => {
    withAuthStatus("authenticated");
    // getCurrentMode never resolves within this synchronous render.
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderHook(() => useTeamAuth());
    expect(result.current.canUseTeams).toBe(false);
  });

  it("grants team access only when authenticated AND in SaaS mode", async () => {
    withAuthStatus("authenticated");
    getCurrentModeMock.mockResolvedValue("saas");

    const { result } = renderHook(() => useTeamAuth());
    await waitFor(() => expect(result.current.canUseTeams).toBe(true));
  });

  it("denies team access in self-hosted mode even when authenticated", async () => {
    withAuthStatus("authenticated");
    getCurrentModeMock.mockResolvedValue("selfhosted");

    const { result } = renderHook(() => useTeamAuth());
    // Flush the resolved mode promise (+ its state update) inside act, then
    // assert canUseTeams stayed false.
    await act(async () => {});
    expect(result.current.canUseTeams).toBe(false);
  });

  it("denies team access when in SaaS mode but unauthenticated", async () => {
    withAuthStatus("unauthenticated");
    getCurrentModeMock.mockResolvedValue("saas");

    const { result } = renderHook(() => useTeamAuth());
    await act(async () => {});
    expect(result.current.canUseTeams).toBe(false);
  });
});
