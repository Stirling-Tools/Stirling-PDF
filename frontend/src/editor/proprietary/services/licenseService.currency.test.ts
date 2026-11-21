// @vitest-environment node
import { expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@editor/services/supabaseClient", () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: () => true,
}));
vi.mock("@editor/services/apiClient", () => ({ default: {} }));
import licenseService from "@editor/services/licenseService";

it.each([
  ["usd", 100, "$", 1],
  ["jpy", 15000, "JPY", 15000],
  ["cad", 13900, "CAD", 139],
])(
  "uses Stripe's %s amounts when the requested GBP currency differs",
  async (currency, amount, symbol, expected) => {
    invoke.mockResolvedValue({
      data: {
        prices: {
          "selfhosted:team:monthly": { unit_amount: amount * 100, currency },
          "selfhosted:team:yearly": { unit_amount: amount * 1000, currency },
          "selfhosted:teamseat:monthly": { unit_amount: amount, currency },
          "selfhosted:teamseat:yearly": { unit_amount: amount * 10, currency },
        },
        missing: [],
      },
      error: null,
    });
    const result = await licenseService.getPlans(
      { FREE: [], SERVER: [], ENTERPRISE: [] },
      {
        FREE: [],
        SERVER_MONTHLY: [],
        SERVER_YEARLY: [],
        ENTERPRISE_MONTHLY: [],
        ENTERPRISE_YEARLY: [],
      },
      "gbp",
    );
    expect(
      result.plans.find((p) => p.id === "selfhosted:teamseat:monthly"),
    ).toMatchObject({ currency: symbol, price: expected, userBlockSize: 1 });
    expect(
      result.plans.find((p) => p.id === "selfhosted:enterprise:monthly"),
    ).toMatchObject({
      lookupKey: "selfhosted:team:monthly",
      price: expected * 100,
    });
  },
);

it("looks up only Team prices so Enterprise currency support cannot force a USD fallback", async () => {
  invoke.mockResolvedValue({
    data: {
      prices: {
        "selfhosted:teamseat:monthly": { unit_amount: 15000, currency: "aud" },
        "selfhosted:teamseat:yearly": { unit_amount: 150000, currency: "aud" },
      },
      missing: [],
    },
    error: null,
  });
  const result = await licenseService.getPlans(
    { FREE: [], SERVER: [], ENTERPRISE: [] },
    {
      FREE: [],
      SERVER_MONTHLY: [],
      SERVER_YEARLY: [],
      ENTERPRISE_MONTHLY: [],
      ENTERPRISE_YEARLY: [],
    },
    "aud",
    true,
    "server",
  );
  expect(invoke).toHaveBeenLastCalledWith("stripe-price-lookup", {
    body: {
      lookup_keys: [
        "selfhosted:teamseat:monthly",
        "selfhosted:teamseat:yearly",
      ],
      currency: "aud",
    },
  });
  expect(
    result.plans.find((p) => p.id === "selfhosted:teamseat:monthly"),
  ).toMatchObject({ currency: "AUD", price: 150 });
  expect(result.plans.map((plan) => plan.id)).toEqual([
    "free",
    "selfhosted:teamseat:monthly",
    "selfhosted:teamseat:yearly",
  ]);
  expect(
    licenseService.groupPlansByTier(result.plans).map((group) => group.tier),
  ).toEqual(["free", "server"]);
});
