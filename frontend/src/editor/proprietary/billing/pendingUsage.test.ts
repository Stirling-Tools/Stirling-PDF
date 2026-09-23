import { describe, expect, it } from "vitest";
import { estimatedBillWithPending } from "@app/billing/pendingUsage";
import { subscribedWallet } from "@app/billing/walletFixtures";

describe("pending credit charges", () => {
  it.each([
    [100, 300, 0, 0],
    [400, 300, 200, 0],
    [600, 300, 200, 100],
    [250, 0, 0, 250],
  ])(
    "accounts for free and prepaid credits (%i pending, %i free, %i prepaid)",
    (pending, free, prepaid, paid) => {
      expect(
        estimatedBillWithPending(
          {
            ...subscribedWallet,
            estimatedBillMinor: 1000,
            pricePerDocMinor: 1,
            freeRemaining: free,
            prepaidUnitsRemaining: prepaid,
          },
          pending,
        ),
      ).toBe(1000 + paid);
    },
  );
  it("does not price overflow without an active meter", () => {
    expect(
      estimatedBillWithPending(
        {
          ...subscribedWallet,
          processor: { active: false },
          estimatedBillMinor: 0,
        },
        500,
      ),
    ).toBe(0);
  });
  it("preserves an unknown estimate", () => {
    expect(
      estimatedBillWithPending(
        { ...subscribedWallet, estimatedBillMinor: null },
        500,
      ),
    ).toBeNull();
  });
});
