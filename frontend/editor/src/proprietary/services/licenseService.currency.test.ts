import { expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@app/services/supabaseClient", () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: () => true,
}));
vi.mock("@app/services/apiClient", () => ({ default: {} }));
import licenseService from "@app/services/licenseService";

it.each([
  ["usd", 9900, "$", 99],
  ["jpy", 15000, "JPY", 15000],
  ["cad", 13900, "CAD", 139],
])(
  "uses Stripe's %s amounts when the requested GBP currency differs",
  async (currency, amount, symbol, expected) => {
    invoke.mockResolvedValue({
      data: {
        prices: {
          "selfhosted:team:monthly": { unit_amount: amount, currency },
          "selfhosted:team:yearly": { unit_amount: amount * 10, currency },
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
      result.plans.find((p) => p.id === "selfhosted:team:monthly"),
    ).toMatchObject({ currency: symbol, price: expected });
  },
);
