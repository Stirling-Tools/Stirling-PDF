import { describe, it, expect, vi, beforeEach } from "vitest";
import { alert } from "@app/components/toast";
import { handleHttpError } from "@app/services/httpErrorHandler";

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
    config: { url: "/api/v1/general/thing", ...config },
    response: { status, data: { error: "boom" } },
    message: "Request failed",
  };
}

/**
 * Pins the half of the `suppressErrorToast` contract that a request-side
 * assertion cannot see: that the interceptor reads the flag off the
 * top-level axios CONFIG, and that the header of the same name does
 * nothing. Callers such as the v2 editor's BackendResolver depend on it to
 * keep dozens of parallel background probes from popping toasts.
 */
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
    // The header form is inert - it ships a junk header to the backend and
    // the interceptor never looks at it. This is the regression that let a
    // stale test pass while the flag did nothing.
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
