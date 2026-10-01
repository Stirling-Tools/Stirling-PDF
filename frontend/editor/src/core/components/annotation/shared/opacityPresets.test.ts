import { describe, expect, it } from "vitest";
import {
  nearestOpacityPreset,
  OPACITY_PRESETS,
} from "@app/components/annotation/shared/opacityPresets";

describe("nearestOpacityPreset", () => {
  it("returns an exact preset unchanged", () => {
    for (const preset of OPACITY_PRESETS) {
      expect(nearestOpacityPreset(preset)).toBe(preset);
    }
  });

  // The control must always show a selection, including for an opacity that did
  // not come from the presets (a document can arrive carrying its own).
  it("rounds an arbitrary opacity to the nearest preset", () => {
    expect(nearestOpacityPreset(0)).toBe(25);
    expect(nearestOpacityPreset(40)).toBe(50);
    expect(nearestOpacityPreset(60)).toBe(50);
    expect(nearestOpacityPreset(99)).toBe(100);
  });

  it("rounds an exact tie upwards", () => {
    expect(nearestOpacityPreset(37.5)).toBe(50);
    expect(nearestOpacityPreset(62.5)).toBe(75);
    expect(nearestOpacityPreset(87.5)).toBe(100);
  });

  it("clamps values outside the slider range", () => {
    expect(nearestOpacityPreset(-20)).toBe(25);
    expect(nearestOpacityPreset(400)).toBe(100);
  });
});
