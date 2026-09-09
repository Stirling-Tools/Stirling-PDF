import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  FREE_LIMIT_MODAL_EVENT,
  SPEND_CAP_MODAL_EVENT,
} from "@app/components/usageLimitModals";
import {
  classifyPaygError,
  extractSignupCategory,
  extractSubscribed,
  handlePaygError,
} from "@app/services/paygErrorInterceptor";

describe("classifyPaygError", () => {
  it("returns FEATURE_DEGRADED for 402 + error sentinel", () => {
    const err = {
      response: {
        status: 402,
        data: {
          error: "FEATURE_DEGRADED",
          subscribed: false,
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

  it("returns PAYG_LIMIT_REACHED for 402 + error sentinel (API-key path)", () => {
    const err = {
      response: {
        status: 402,
        data: { error: "PAYG_LIMIT_REACHED", subscribed: true },
      },
    };
    expect(classifyPaygError(err)).toBe("PAYG_LIMIT_REACHED");
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

  it("returns null for 402 without a known sentinel", () => {
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
    expect(extractSignupCategory({ response: { data: {} } })).toBeNull();
  });
});

describe("extractSubscribed", () => {
  it("returns the boolean when present", () => {
    expect(
      extractSubscribed({ response: { data: { subscribed: true } } }),
    ).toBe(true);
    expect(
      extractSubscribed({ response: { data: { subscribed: false } } }),
    ).toBe(false);
  });

  it("returns null when missing or wrong type", () => {
    expect(extractSubscribed(null)).toBeNull();
    expect(extractSubscribed({})).toBeNull();
    expect(extractSubscribed({ response: { data: {} } })).toBeNull();
    expect(
      extractSubscribed({ response: { data: { subscribed: "yes" } } }),
    ).toBeNull();
  });
});

describe("handlePaygError — usage-limit modals", () => {
  let freeOpened: number;
  let spendOpened: number;
  const onFree = () => (freeOpened += 1);
  const onSpend = () => (spendOpened += 1);

  beforeEach(() => {
    vi.clearAllMocks();
    freeOpened = 0;
    spendOpened = 0;
    window.addEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
    window.addEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
  });

  afterEach(() => {
    window.removeEventListener(FREE_LIMIT_MODAL_EVENT, onFree);
    window.removeEventListener(SPEND_CAP_MODAL_EVENT, onSpend);
  });

  it("FEATURE_DEGRADED + unsubscribed → opens the free-limit modal (no spend-cap)", () => {
    handlePaygError("FEATURE_DEGRADED", {
      response: {
        status: 402,
        data: { error: "FEATURE_DEGRADED", subscribed: false },
      },
    });
    expect(freeOpened).toBe(1);
    expect(spendOpened).toBe(0);
  });

  it("FEATURE_DEGRADED + subscribed → opens the spend-cap modal", () => {
    handlePaygError("FEATURE_DEGRADED", {
      response: {
        status: 402,
        data: { error: "FEATURE_DEGRADED", subscribed: true },
      },
    });
    expect(spendOpened).toBe(1);
    expect(freeOpened).toBe(0);
  });

  it("PAYG_LIMIT_REACHED + subscribed → opens the spend-cap modal", () => {
    handlePaygError("PAYG_LIMIT_REACHED", {
      response: {
        status: 402,
        data: { error: "PAYG_LIMIT_REACHED", subscribed: true },
      },
    });
    expect(spendOpened).toBe(1);
    expect(freeOpened).toBe(0);
  });

  it("PAYG_LIMIT_REACHED + unsubscribed → opens the free-limit modal", () => {
    handlePaygError("PAYG_LIMIT_REACHED", {
      response: {
        status: 402,
        data: { error: "PAYG_LIMIT_REACHED", subscribed: false },
      },
    });
    expect(freeOpened).toBe(1);
    expect(spendOpened).toBe(0);
  });

  it("defaults to the free-limit modal when subscribed is absent", () => {
    handlePaygError("FEATURE_DEGRADED", {
      response: { status: 402, data: { error: "FEATURE_DEGRADED" } },
    });
    expect(freeOpened).toBe(1);
    expect(spendOpened).toBe(0);
  });
});

describe("handlePaygError — signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
