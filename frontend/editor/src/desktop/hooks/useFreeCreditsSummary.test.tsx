import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentModeMock, subscribeToModeChangesMock, apiGetMock } =
  vi.hoisted(() => ({
    getCurrentModeMock: vi.fn(),
    subscribeToModeChangesMock: vi.fn(),
    apiGetMock: vi.fn(),
  }));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: getCurrentModeMock,
    subscribeToModeChanges: subscribeToModeChangesMock,
  },
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: apiGetMock },
}));

// useWallet imports the Stripe portal seam, which on desktop builds a Supabase client at module
// load and throws without its env vars. The footer meter never mints a portal session.
vi.mock("@app/services/billing", () => ({
  createPortalSession: vi.fn(),
}));

import { useFreeCreditsSummary } from "@app/hooks/useFreeCreditsSummary";

const WALLET = {
  status: "free",
  freeRemaining: 120,
  freeAllowance: 500,
};

describe("useFreeCreditsSummary (desktop)", () => {
  beforeEach(() => {
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset();
    subscribeToModeChangesMock.mockReturnValue(() => {});
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue({ data: WALLET });
    window.localStorage.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it.each(["local", "selfhosted"])(
    "reads no wallet in %s mode, where nothing serves one",
    async (mode) => {
      getCurrentModeMock.mockResolvedValue(mode);
      const { result } = renderHook(() => useFreeCreditsSummary());
      await act(async () => {});
      expect(apiGetMock).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    },
  );

  it("asks for nothing before the mode resolves", () => {
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    renderHook(() => useFreeCreditsSummary());
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("reads the wallet once signed in to the cloud", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    const { result } = renderHook(() => useFreeCreditsSummary());
    await waitFor(() =>
      expect(result.current).toEqual({ remaining: 120, total: 500 }),
    );
    expect(apiGetMock).toHaveBeenCalledWith("/api/v1/payg/wallet");
  });
});
