import { describe, it, expect, vi, beforeEach } from "vitest";
import { alert } from "@app/components/toast";
import { handleHttpError } from "@app/services/httpErrorHandler";
import {
  clearAccountLinkBlock,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";
import { act, renderHook } from "@testing-library/react";

// Only the toast surface matters here; the rest of the handler's graph is
// heavy UI that these cases never reach.
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/services/specialErrorToasts", () => ({
  showSpecialErrorToast: vi.fn().mockReturnValue(false),
}));
vi.mock("@app/services/saasErrorInterceptor", () => ({
  handleSaaSError: vi.fn().mockReturnValue(false),
}));

function axiosError(config: Record<string, unknown>, status = 500) {
  return {
    // The interceptor only ever sees real AxiosErrors; handleHttpError gates on
    // axios.isAxiosError, so the fixture must carry the marker.
    isAxiosError: true,
    config: { url: "/api/v1/general/thing", ...config },
    response: { status, data: { error: "boom" } },
    message: "Request failed",
  };
}

// Pins the half of the `suppressErrorToast` contract that a request-side
// assertion cannot see: that the interceptor reads the flag off the.
describe("handleHttpError - suppressErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses the toast when config.suppressErrorToast is true", async () => {
    const suppressed = await handleHttpError(
      axiosError({ suppressErrorToast: true }),
    );
    expect(suppressed).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it("shows the toast when the flag is absent", async () => {
    await handleHttpError(axiosError({}));
    expect(alert).toHaveBeenCalled();
  });

  it("ignores the flag when it is spelled as a request HEADER", async () => {
    // The header form is inert - it ships a junk header to the backend and the
    // interceptor never looks at it.
    await handleHttpError(
      axiosError({ headers: { suppressErrorToast: "true" } }),
    );
    expect(alert).toHaveBeenCalled();
  });

  it("short-circuits a 401 before the login redirect", async () => {
    const before = window.location.href;
    const suppressed = await handleHttpError(
      axiosError({ suppressErrorToast: true }, 401),
    );
    expect(suppressed).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
  });
});

describe("local free allowance failures", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
    vi.clearAllMocks();
  });

  it("recognizes a blob 402 before generic toast suppression", async () => {
    const probe = renderHook(() => useAccountLinkBlock());
    const error = {
      ...axiosError({ suppressErrorToast: true }, 402),
      response: {
        status: 402,
        data: {
          text: async () =>
            JSON.stringify({
              error: "ACCOUNT_LINK_REQUIRED",
              reason: "FREE_TIER_EXHAUSTED",
            }),
        },
      },
    };
    await act(async () => {
      expect(await handleHttpError(error)).toBe(true);
    });
    expect(probe.result.current.promptPending).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it("requests the first modal for background exhaustion", async () => {
    const probe = renderHook(() => useAccountLinkBlock());
    const error = {
      ...axiosError({ accountLinkBlockSource: "background" }, 402),
      response: {
        status: 402,
        data: { error: "ACCOUNT_LINK_REQUIRED", reason: "FREE_TIER_EXHAUSTED" },
      },
    };
    await act(async () => {
      await handleHttpError(error);
    });
    expect(probe.result.current.exhausted).toBe(true);
    expect(probe.result.current.promptPending).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it("does not offer linking for a linked team's exhausted wallet", async () => {
    const probe = renderHook(() => useAccountLinkBlock());
    await handleHttpError({
      ...axiosError({}, 402),
      response: {
        status: 402,
        data: { error: "ACCOUNT_LINK_REQUIRED", reason: "OVER_LIMIT" },
      },
    });
    expect(probe.result.current.exhausted).toBe(false);
    expect(alert).toHaveBeenCalled();
  });
});
