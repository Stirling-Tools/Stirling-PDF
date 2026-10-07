import { beforeEach, describe, expect, it, vi } from "vitest";

const json = vi.hoisted(() => vi.fn());
vi.mock("@portal/api/http", () => ({ apiClient: { saas: { json } } }));

import {
  cancelSubscription,
  contactBeforeCancelling,
  fetchSubscriptionStates,
  resumeSubscription,
} from "@portal/api/billing";

const TEAM = {
  product: "team",
  subscriptionId: "sub_team",
  status: "active",
  cancelling: true,
  endsAt: "2026-11-14T00:00:00Z",
  periodEnd: "2026-11-14T00:00:00Z",
};

describe("subscription cancellation client", () => {
  beforeEach(() => json.mockReset());

  it("reads the team's subscriptions from the SaaS backend", async () => {
    json.mockResolvedValue({ subscriptions: [TEAM] });
    expect(await fetchSubscriptionStates()).toEqual([TEAM]);
    expect(json).toHaveBeenCalledWith("/api/v1/payg/subscriptions");
  });

  it("cancels and resumes through the subscription endpoints", async () => {
    json.mockResolvedValue({ subscriptions: [TEAM] });
    await cancelSubscription({
      product: "team",
      reason: "switched_service",
      competitor: "Acrobat",
    });
    expect(json).toHaveBeenLastCalledWith("/api/v1/payg/subscriptions/cancel", {
      method: "POST",
      body: {
        product: "team",
        reason: "switched_service",
        competitor: "Acrobat",
      },
    });
    await resumeSubscription("both");
    expect(json).toHaveBeenLastCalledWith("/api/v1/payg/subscriptions/resume", {
      method: "POST",
      body: { product: "both" },
    });
  });

  it("sends a message to the team", async () => {
    json.mockResolvedValue(undefined);
    await contactBeforeCancelling({
      product: "processor",
      reason: null,
      message: "hi",
    });
    expect(json).toHaveBeenCalledWith("/api/v1/payg/subscriptions/contact", {
      method: "POST",
      body: { product: "processor", reason: null, message: "hi" },
    });
  });
});
