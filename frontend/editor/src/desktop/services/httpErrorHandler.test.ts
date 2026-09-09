import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";
import { FREE_LIMIT_MODAL_EVENT } from "@app/components/usageLimitModals";
import { handleHttpError } from "@app/services/httpErrorHandler";

// The non-PAYG path delegates to core; stub it so these cases stay isolated.
vi.mock("@core/services/httpErrorHandler", () => ({
  handleHttpError: vi.fn().mockResolvedValue(false),
}));

function axiosErr(
  status: number,
  sentinel: string,
  extra: Record<string, unknown> = {},
) {
  return {
    isAxiosError: true,
    response: { status, data: { error: sentinel, ...extra } },
  };
}

describe("desktop handleHttpError — PAYG sentinels", () => {
  let events: string[];
  let listener: (e: Event) => void;

  beforeEach(() => {
    events = [];
    listener = (e: Event) => events.push(e.type);
    window.addEventListener(OPEN_SIGN_IN_EVENT, listener);
    window.addEventListener(FREE_LIMIT_MODAL_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(OPEN_SIGN_IN_EVENT, listener);
    window.removeEventListener(FREE_LIMIT_MODAL_EVENT, listener);
  });

  test("401 SIGNUP_REQUIRED opens the desktop sign-in modal", async () => {
    const handled = await handleHttpError(axiosErr(401, "SIGNUP_REQUIRED"));
    expect(handled).toBe(true);
    expect(events).toContain(OPEN_SIGN_IN_EVENT);
  });

  test("402 FEATURE_DEGRADED (free) pops the limit modal, not sign-in", async () => {
    const handled = await handleHttpError(
      axiosErr(402, "FEATURE_DEGRADED", { subscribed: false }),
    );
    expect(handled).toBe(true);
    expect(events).toContain(FREE_LIMIT_MODAL_EVENT);
    expect(events).not.toContain(OPEN_SIGN_IN_EVENT);
  });
});
