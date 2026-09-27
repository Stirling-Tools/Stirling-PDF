import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVelocityAdaptiveExtraRings,
  initScrollVelocityTracker,
} from "./scrollVelocityTracker";

describe("scrollVelocityTracker", () => {
  beforeEach(() => {
    initScrollVelocityTracker();
  });

  it("returns base rings when scroll is idle", () => {
    expect(getVelocityAdaptiveExtraRings(1)).toBe(1);
    expect(getVelocityAdaptiveExtraRings(0)).toBe(0);
  });

  it("boosts rings by 1 when high velocity scroll is detected", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);

    let currentTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => currentTime);

    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: false }));

    // Scroll 200px in 50ms = 4000 px/s velocity (> 1500 threshold)
    currentTime = 1050;
    element.scrollTop = 200;
    element.dispatchEvent(new Event("scroll", { bubbles: false }));

    expect(getVelocityAdaptiveExtraRings(1)).toBe(2);

    // After boost window expires (350ms)
    currentTime = 1450;
    expect(getVelocityAdaptiveExtraRings(1)).toBe(1);

    document.body.removeChild(element);
    vi.restoreAllMocks();
  });
});
