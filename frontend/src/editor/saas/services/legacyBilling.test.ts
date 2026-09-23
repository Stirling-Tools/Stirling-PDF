import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLegacyPortalSession,
  fetchLegacySubscriptions,
} from "@app/services/legacyBilling";

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
  returns: vi.fn(),
};
const from = vi.fn();
const invoke = vi.fn();
const getTeam = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: { get: (...args: unknown[]) => getTeam(...args) },
}));
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

describe("legacy billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue(query);
    for (const method of [query.select, query.eq, query.in, query.order])
      method.mockReturnValue(query);
  });

  it("scopes the query to the owner and both exact historical prices, excluding ended and unrelated subscriptions", async () => {
    const row = {
      id: "sub_1",
      price_id: "price_1SBckcP9mY5IAnSneeH0TJHs",
      status: "active",
      current_period_end: "2026-10-01T00:00:00Z",
      team_id: null,
    };
    query.returns.mockResolvedValue({
      data: [
        row,
        {
          ...row,
          id: "sub_2",
          price_id: "price_1SzFCEP9mY5IAnSno62u0Tti",
          status: "past_due",
        },
        { ...row, id: "sub_cancelled", status: "canceled" },
        { ...row, id: "sub_other", price_id: "price_current_team" },
      ],
      error: null,
    });
    const subscriptions = await fetchLegacySubscriptions("owner-id");
    expect(from).toHaveBeenCalledWith("billing_subscriptions");
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(query.in).toHaveBeenCalledWith("price_id", [
      "price_1SBckcP9mY5IAnSneeH0TJHs",
      "price_1SzFCEP9mY5IAnSno62u0Tti",
    ]);
    expect(query.in).toHaveBeenCalledWith("status", [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
    ]);
    expect(subscriptions.map((s) => [s.id, s.plan, s.status])).toEqual([
      ["sub_1", "pro", "active"],
      ["sub_2", "team", "past_due"],
    ]);
    expect(subscriptions[0].currentPeriodEnd).toBe(row.current_period_end);
    expect(getTeam).not.toHaveBeenCalled();
  });

  it.each([
    [12, 12],
    [2147483647, null],
  ])(
    "reads the linked team's %s-user allowance without falling back to five",
    async (maxSeats, expectedLimit) => {
      query.returns.mockResolvedValue({
        data: [
          {
            id: "sub_team",
            price_id: "price_1SzFCEP9mY5IAnSno62u0Tti",
            status: "active",
            current_period_end: null,
            team_id: 42,
          },
        ],
        error: null,
      });
      getTeam.mockResolvedValue({
        data: { teamId: 42, maxSeats, seatsUsed: 3 },
      });
      const [subscription] = await fetchLegacySubscriptions("owner-id");
      expect(getTeam).toHaveBeenCalledWith("/api/v1/team/42", {
        suppressErrorToast: true,
      });
      expect(subscription.teamAllowance).toEqual({
        teamId: 42,
        maxUsers: expectedLimit,
        usersInUse: 3,
      });
    },
  );

  it("keeps billing available when linked team capacity cannot be read", async () => {
    query.returns.mockResolvedValue({
      data: [
        {
          id: "sub_team",
          price_id: "price_1SzFCEP9mY5IAnSno62u0Tti",
          status: "active",
          current_period_end: null,
          team_id: 42,
        },
      ],
      error: null,
    });
    getTeam.mockRejectedValue(new Error("Forbidden"));
    const [subscription] = await fetchLegacySubscriptions("owner-id");
    expect(subscription.id).toBe("sub_team");
    expect(subscription.teamAllowance).toBeNull();
  });

  it("surfaces a failed lookup instead of returning an empty subscription list", async () => {
    query.returns.mockResolvedValue({
      data: null,
      error: new Error("RLS unavailable"),
    });
    await expect(fetchLegacySubscriptions("owner-id")).rejects.toThrow(
      "RLS unavailable",
    );
  });

  it("lets the authenticated edge function choose the customer, without sending a team or customer id", async () => {
    invoke.mockResolvedValue({
      data: { url: "https://billing.stripe.com/p/session/test" },
      error: null,
    });
    await expect(createLegacyPortalSession()).resolves.toBe(
      "https://billing.stripe.com/p/session/test",
    );
    expect(invoke).toHaveBeenCalledWith("manage-billing", {
      body: { return_url: window.location.href },
    });
  });

  it.each([
    null,
    { url: "https://example.com" },
    { url: "javascript:alert(1)" },
  ])("rejects a missing or invalid portal URL (%j)", async (data) => {
    invoke.mockResolvedValue({ data, error: null });
    await expect(createLegacyPortalSession()).rejects.toThrow();
  });
});
