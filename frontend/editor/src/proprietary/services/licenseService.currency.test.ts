import { expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@app/services/supabaseClient", () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: () => true,
}));
vi.mock("@app/services/apiClient", () => ({ default: {} }));
import licenseService from "@app/services/licenseService";

it("labels returned prices with Stripe's currency when the requested currency is unavailable", async () => {
  invoke.mockResolvedValue({
    data: {
      prices: {
        "selfhosted:server:monthly": { unit_amount: 9900, currency: "usd" },
        "selfhosted:server:yearly": { unit_amount: 99900, currency: "usd" },
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
    result.plans.find((p) => p.id === "selfhosted:server:monthly"),
  ).toMatchObject({ currency: "$", price: 99 });
});
