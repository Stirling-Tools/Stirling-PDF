import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentModeMock, subscribeToModeChangesMock } = vi.hoisted(() => ({
  getCurrentModeMock: vi.fn(),
  subscribeToModeChangesMock: vi.fn(),
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: getCurrentModeMock,
    subscribeToModeChanges: subscribeToModeChangesMock,
  },
}));

import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";

// Resolved through @app/*, which is how NotificationBell reaches it: desktop must win over the
// proprietary answer, or this is the proprietary hook and the assertions below pass for nothing.
describe("useNotificationsAvailable (desktop)", () => {
  beforeEach(() => {
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset();
    subscribeToModeChangesMock.mockReturnValue(() => {});
  });
  afterEach(() => vi.clearAllMocks());

  it("says no in local mode: the bundled backend serves no notification route", async () => {
    getCurrentModeMock.mockResolvedValue("local");
    const { result } = renderHook(() => useNotificationsAvailable());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it("says no until the mode is known, so a cold start polls nothing", () => {
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    const { result } = renderHook(() => useNotificationsAvailable());
    expect(result.current).toBe(false);
  });

  it.each(["saas", "selfhosted"])(
    "says yes against a %s server, which does serve them",
    async (mode) => {
      getCurrentModeMock.mockResolvedValue(mode);
      const { result } = renderHook(() => useNotificationsAvailable());
      await waitFor(() => expect(result.current).toBe(true));
    },
  );
});
