// @vitest-environment node
import { expect, it, vi } from "vitest";
import { pollTeamCheckout } from "@editor/utils/licenseCheckoutUtils";
import { verifyTeamCheckout } from "@editor/services/serverPlanCheckout";
import { requiresLocalTeamActivation } from "@editor/services/teamPlanActivation";

vi.mock("@editor/services/serverPlanCheckout", () => ({
  verifyTeamCheckout: vi.fn(),
}));
vi.mock("@editor/services/teamPlanActivation", () => ({
  requiresLocalTeamActivation: vi.fn(),
}));
vi.mock("@editor/services/licenseService", () => ({ default: {} }));

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
