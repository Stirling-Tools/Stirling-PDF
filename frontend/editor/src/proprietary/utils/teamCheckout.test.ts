import { beforeEach, expect, it, vi } from "vitest";
const { verify, resync, info, requiresLocal } = vi.hoisted(() => ({
  verify: vi.fn(),
  resync: vi.fn(),
  info: vi.fn(),
  requiresLocal: vi.fn(),
}));
vi.mock("@app/services/teamPlanActivation", () => ({
  requiresLocalTeamActivation: requiresLocal,
}));
vi.mock("@app/services/serverPlanCheckout", () => ({
  verifyTeamCheckout: verify,
}));
vi.mock("@app/services/licenseService", () => ({
  default: { resyncLicense: resync, getLicenseInfo: info },
}));
import { pollTeamCheckout } from "@app/utils/licenseCheckoutUtils";

beforeEach(() => {
  requiresLocal.mockReset().mockResolvedValue(true);
  verify.mockReset();
  resync
    .mockReset()
    .mockResolvedValue({ success: true, licenseType: "SERVER" });
  info.mockReset().mockResolvedValue({ licenseType: "SERVER", hasKey: false });
});

it("activates hosted Team capacity without calling the server administrator licence endpoint", async () => {
  requiresLocal.mockResolvedValue(false);
  verify.mockResolvedValue(true);
  expect(
    (await pollTeamCheckout("cs_team", 2, { backoffMs: [0] })).success,
  ).toBe(true);
  expect(resync).not.toHaveBeenCalled();
});

it("keeps waiting when the linked server has not received paid capacity", async () => {
  verify.mockResolvedValue(true);
  resync.mockResolvedValue({ success: true, licenseType: "NORMAL" });
  info.mockResolvedValue({ licenseType: "NORMAL", hasKey: false });
  expect(
    (await pollTeamCheckout("cs_team", 2, { backoffMs: [0] })).success,
  ).toBe(false);
});

it("waits for purchased capacity before refreshing the server and announcing activation", async () => {
  verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const onActivated = vi.fn();
  const onStatusChange = vi.fn();
  const result = await pollTeamCheckout("cs_team", 2, {
    backoffMs: [0, 0],
    onActivated,
    onStatusChange,
  });
  expect(result.success).toBe(true);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(resync).toHaveBeenCalledTimes(1);
  expect(onActivated).toHaveBeenCalledWith({
    licenseType: "SERVER",
    hasKey: false,
  });
  expect(onStatusChange.mock.calls.map(([status]) => status)).toEqual([
    "polling",
    "ready",
  ]);
});

it("does not announce activation when fulfilment is delayed", async () => {
  verify.mockResolvedValue(false);
  const result = await pollTeamCheckout("cs_team", 2, { backoffMs: [0, 0] });
  expect(result.success).toBe(false);
  expect(resync).not.toHaveBeenCalled();
});

it("retries a transient verification error", async () => {
  verify
    .mockRejectedValueOnce(new Error("temporary outage"))
    .mockResolvedValueOnce(true);
  expect(
    (await pollTeamCheckout("cs_team", 2, { backoffMs: [0, 0] })).success,
  ).toBe(true);
});
