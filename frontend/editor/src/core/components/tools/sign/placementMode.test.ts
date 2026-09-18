import { describe, expect, it } from "vitest";
import { shouldPausePlacementAfterExit } from "@app/components/tools/sign/placementMode";

const baseParams = {
  wasInPlacementMode: true,
  isInPlacementMode: false,
  placeMultiple: false,
  signaturesApplied: false,
  placementEnabled: true,
  alreadyPaused: false,
};

describe("shouldPausePlacementAfterExit", () => {
  it("pauses after a single placement exits placement mode", () => {
    expect(shouldPausePlacementAfterExit(baseParams)).toBe(true);
  });

  it("does not pause while still in placement mode", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        isInPlacementMode: true,
      }),
    ).toBe(false);
  });

  it("does not pause when placement mode was never active", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        wasInPlacementMode: false,
      }),
    ).toBe(false);
  });

  it("does not pause when 'place multiple' is enabled", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        placeMultiple: true,
      }),
    ).toBe(false);
  });

  it("does not pause once signatures have been applied", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        signaturesApplied: true,
      }),
    ).toBe(false);
  });

  it("does not pause when placement is disabled", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        placementEnabled: false,
      }),
    ).toBe(false);
  });

  it("does not re-pause when already paused", () => {
    expect(
      shouldPausePlacementAfterExit({
        ...baseParams,
        alreadyPaused: true,
      }),
    ).toBe(false);
  });
});
