import { expect, it, vi } from "vitest";
import { pollTeamCheckout } from "@app/utils/licenseCheckoutUtils";
import { verifyTeamCheckout } from "@app/services/serverPlanCheckout";
import { requiresLocalTeamActivation } from "@app/services/teamPlanActivation";

vi.mock("@app/services/serverPlanCheckout", () => ({
  verifyTeamCheckout: vi.fn(),
}));
vi.mock("@app/services/teamPlanActivation", () => ({
  requiresLocalTeamActivation: vi.fn(),
}));
vi.mock("@app/services/licenseService", () => ({ default: {} }));

it("reports a scheduled reduction without activating the lower allowance early", async () => {
  vi.mocked(verifyTeamCheckout).mockResolvedValue({
    scheduleId: "sched_team",
    quantity: 1,
    effectiveAt: 1800000000,
    interval: "month",
  });
  const onActivated = vi.fn();
  expect(
    await pollTeamCheckout("sub_team", 1, { backoffMs: [0], onActivated }),
  ).toEqual({
    success: true,
    scheduledAt: 1800000000,
  });
  expect(requiresLocalTeamActivation).not.toHaveBeenCalled();
  expect(onActivated).not.toHaveBeenCalled();
});
