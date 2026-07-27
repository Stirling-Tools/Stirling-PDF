import { describe, it, expect, beforeEach } from "vitest";
import {
  getReviewGateRequest,
  registerNeedsReviewResolver,
  requestReviewClearance,
  resetReviewGate,
  settleReviewGate,
} from "@app/services/reviewGate";

describe("reviewGate", () => {
  beforeEach(() => resetReviewGate());

  it("clears immediately when no host is mounted, so headless exports can't hang", async () => {
    await expect(requestReviewClearance(["a"], "download")).resolves.toBe(true);
    expect(getReviewGateRequest()).toBeNull();
  });

  it("clears immediately when nothing targeted needs review", async () => {
    registerNeedsReviewResolver(() => []);
    await expect(requestReviewClearance(["a", "b"], "download")).resolves.toBe(
      true,
    );
    expect(getReviewGateRequest()).toBeNull();
  });

  it("holds the export until the user answers, and reports their choice", async () => {
    registerNeedsReviewResolver((ids) => ids.filter((id) => id === "bad"));

    const allowed = requestReviewClearance(["ok", "bad"], "print");
    // Only the flagged file is surfaced, not every target.
    expect(getReviewGateRequest()).toEqual({ fileIds: ["bad"], verb: "print" });

    settleReviewGate(true);
    await expect(allowed).resolves.toBe(true);
    expect(getReviewGateRequest()).toBeNull();

    const denied = requestReviewClearance(["bad"], "print");
    settleReviewGate(false);
    await expect(denied).resolves.toBe(false);
  });

  it("cancels an overlapping export rather than stacking prompts", async () => {
    registerNeedsReviewResolver(() => ["bad"]);
    const first = requestReviewClearance(["bad"], "download");
    await expect(requestReviewClearance(["bad"], "share")).resolves.toBe(false);
    // The first prompt is untouched and still answerable.
    expect(getReviewGateRequest()?.verb).toBe("download");
    settleReviewGate(true);
    await expect(first).resolves.toBe(true);
  });

  it("stops consulting a resolver once its host unmounts", async () => {
    const unregister = registerNeedsReviewResolver(() => ["bad"]);
    unregister();
    await expect(requestReviewClearance(["bad"], "download")).resolves.toBe(
      true,
    );
  });
});
