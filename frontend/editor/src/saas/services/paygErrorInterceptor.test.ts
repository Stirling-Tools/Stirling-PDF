import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the toast layer and openPlanSettings so we can assert what the
// handler dispatches without needing a real DOM context for the toast
// portal. Mocks are hoisted by vitest so the module under test imports
// these in place of the real implementations.
vi.mock("@app/components/toast", () => ({
  alert: vi.fn(),
}));
vi.mock("@app/utils/appSettings", () => ({
  openPlanSettings: vi.fn(),
}));

import { alert } from "@app/components/toast";
import { openPlanSettings } from "@app/utils/appSettings";
import {
  classifyPaygError,
  extractSignupCategory,
  handlePaygError,
} from "@app/services/paygErrorInterceptor";

describe("classifyPaygError", () => {
  it("returns FEATURE_DEGRADED for 402 + error sentinel", () => {
    const err = {
      response: {
        status: 402,
        data: {
          error: "FEATURE_DEGRADED",
          missingGates: ["AUTOMATION"],
          state: "DEGRADED",
          periodEnd: "2026-06-30",
          capUnits: 500,
          spendUnits: 500,
        },
      },
    };
    expect(classifyPaygError(err)).toBe("FEATURE_DEGRADED");
  });

  it("returns SIGNUP_REQUIRED for 401 + error sentinel", () => {
    const err = {
      response: {
        status: 401,
        data: { error: "SIGNUP_REQUIRED", category: "AI" },
      },
    };
    expect(classifyPaygError(err)).toBe("SIGNUP_REQUIRED");
  });

  it("returns null for plain 401 (session expired path is untouched)", () => {
    const err = {
      response: {
        status: 401,
        data: { error: "Unauthorized" },
      },
    };
    expect(classifyPaygError(err)).toBeNull();
  });

  it("returns null for 402 without the FEATURE_DEGRADED sentinel", () => {
    const err = {
      response: { status: 402, data: { error: "Payment required" } },
    };
    expect(classifyPaygError(err)).toBeNull();
  });

  it("returns null when status mismatches sentinel (defence-in-depth)", () => {
    // 500 + FEATURE_DEGRADED shouldn't match — server may have a bug and
    // we don't want a generic 500 to silently degrade into an upgrade
    // prompt. Same for 403 + SIGNUP_REQUIRED.
    const a = {
      response: { status: 500, data: { error: "FEATURE_DEGRADED" } },
    };
    const b = {
      response: { status: 403, data: { error: "SIGNUP_REQUIRED" } },
    };
    expect(classifyPaygError(a)).toBeNull();
    expect(classifyPaygError(b)).toBeNull();
  });

  it("returns null for malformed errors (null / non-object / no response)", () => {
    expect(classifyPaygError(null)).toBeNull();
    expect(classifyPaygError(undefined)).toBeNull();
    expect(classifyPaygError("oops")).toBeNull();
    expect(classifyPaygError({})).toBeNull();
    expect(classifyPaygError({ response: null })).toBeNull();
    expect(classifyPaygError({ response: { status: 402 } })).toBeNull();
    expect(
      classifyPaygError({ response: { status: 402, data: null } }),
    ).toBeNull();
    expect(
      classifyPaygError({ response: { status: 402, data: "bare-string" } }),
    ).toBeNull();
    expect(
      classifyPaygError({ response: { status: 402, data: { error: 123 } } }),
    ).toBeNull();
  });
});

describe("extractSignupCategory", () => {
  it("returns the category string when present", () => {
    expect(
      extractSignupCategory({
        response: { data: { error: "SIGNUP_REQUIRED", category: "AI" } },
      }),
    ).toBe("AI");
  });

  it("returns null when missing or wrong type", () => {
    expect(extractSignupCategory(null)).toBeNull();
    expect(extractSignupCategory({})).toBeNull();
    expect(
      extractSignupCategory({ response: { data: { category: 7 } } }),
    ).toBeNull();
    expect(
      extractSignupCategory({ response: { data: {} } }),
    ).toBeNull();
  });
});

describe("handlePaygError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the persistent upgrade toast on FEATURE_DEGRADED", () => {
    handlePaygError("FEATURE_DEGRADED", {
      response: { status: 402, data: { error: "FEATURE_DEGRADED" } },
    });
    expect(alert).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(alert).mock.calls[0][0];
    expect(opts.alertType).toBe("warning");
    expect(opts.isPersistentPopup).toBe(true);
    expect(opts.buttonText).toBe("Go to billing");
    // Body should reference the 500-op free monthly allowance so the
    // user understands what they hit.
    expect(String(opts.body)).toMatch(/500/);
  });

  it("invoking the toast's buttonCallback opens the Plan settings tab", () => {
    handlePaygError("FEATURE_DEGRADED", {
      response: { status: 402, data: { error: "FEATURE_DEGRADED" } },
    });
    const opts = vi.mocked(alert).mock.calls[0][0];
    expect(opts.buttonCallback).toBeDefined();
    opts.buttonCallback?.();
    expect(openPlanSettings).toHaveBeenCalledTimes(1);
  });

  it("dispatches payg:signupRequired on SIGNUP_REQUIRED with category in detail", () => {
    const handler = vi.fn();
    window.addEventListener("payg:signupRequired", handler);
    try {
      handlePaygError("SIGNUP_REQUIRED", {
        response: {
          status: 401,
          data: { error: "SIGNUP_REQUIRED", category: "AUTOMATION" },
        },
      });
      expect(handler).toHaveBeenCalledTimes(1);
      const ev = handler.mock.calls[0][0] as CustomEvent;
      expect(ev.detail).toEqual({ category: "AUTOMATION" });
      // No toast for SIGNUP_REQUIRED — the modal carries the message.
      expect(alert).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("payg:signupRequired", handler);
    }
  });

  it("dispatches with category=null when the body has no category", () => {
    const handler = vi.fn();
    window.addEventListener("payg:signupRequired", handler);
    try {
      handlePaygError("SIGNUP_REQUIRED", {
        response: { status: 401, data: { error: "SIGNUP_REQUIRED" } },
      });
      expect(handler).toHaveBeenCalledTimes(1);
      const ev = handler.mock.calls[0][0] as CustomEvent;
      expect(ev.detail).toEqual({ category: null });
    } finally {
      window.removeEventListener("payg:signupRequired", handler);
    }
  });
});
