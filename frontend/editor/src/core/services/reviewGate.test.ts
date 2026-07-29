import { describe, it, expect, beforeEach } from "vitest";
import {
  getReviewGateRequest,
  registerNeedsReviewResolver,
  requestReviewClearance,
  resetReviewGate,
  settleReviewGate,
  withReviewClearance,
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

  it("takes a single id as readily as a list", async () => {
    registerNeedsReviewResolver((ids) => ids);
    const allowed = requestReviewClearance("bad", "download");
    expect(getReviewGateRequest()).toEqual({
      fileIds: ["bad"],
      verb: "download",
    });
    settleReviewGate(true);
    await expect(allowed).resolves.toBe(true);
  });

  it("prompts once for a batch: chokepoints inside it don't ask again", async () => {
    registerNeedsReviewResolver((ids) => ids);
    const inner: boolean[] = [];
    const ran = withReviewClearance(["a", "b"], "download", async () => {
      // Stands in for the download/print chokepoints the export passes through.
      inner.push(await requestReviewClearance("a", "download"));
      inner.push(await requestReviewClearance(["a", "b"], "save"));
      return "exported";
    });
    settleReviewGate(true);
    await expect(ran).resolves.toBe("exported");
    expect(inner).toEqual([true, true]);
    // The clearance ends with the export: a later one prompts again.
    void requestReviewClearance("a", "download");
    expect(getReviewGateRequest()).toEqual({
      fileIds: ["a"],
      verb: "download",
    });
  });

  it("skips the action and reports nothing when the user cancels", async () => {
    registerNeedsReviewResolver((ids) => ids);
    let ran = false;
    const result = withReviewClearance(["bad"], "share", () => {
      ran = true;
      return "sent";
    });
    settleReviewGate(false);
    await expect(result).resolves.toBeUndefined();
    expect(ran).toBe(false);
  });

  it("stops consulting a resolver once its host unmounts", async () => {
    const unregister = registerNeedsReviewResolver(() => ["bad"]);
    unregister();
    await expect(requestReviewClearance(["bad"], "download")).resolves.toBe(
      true,
    );
  });
});
