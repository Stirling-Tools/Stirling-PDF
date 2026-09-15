import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CheckoutProvider, useCheckout } from "@app/contexts/CheckoutContext";
import { expectConsole } from "@app/tests/failOnConsole";

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  alert: vi.fn(),
  features: [],
  highlights: [],
  refetch: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@app/constants/planConstants", () => ({
  usePlanFeatures: () => mocks.features,
  usePlanHighlights: () => mocks.highlights,
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  useLicense: () => ({ refetchLicense: mocks.refetch }),
}));
vi.mock("@app/services/supabaseClient", () => ({ isSupabaseConfigured: true }));
vi.mock("@app/utils/currencyDetection", () => ({
  getPreferredCurrency: () => "usd",
}));
vi.mock("@app/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@app/services/userManagementService", () => ({
  userManagementService: { getUsers: async () => ({ totalUsers: 6 }) },
}));
vi.mock("@app/services/licenseService", () => ({
  default: {
    getPlans: mocks.getPlans,
    getLicenseInfo: async () => null,
    groupPlansByTier: (plans: unknown[]) =>
      plans.length ? [{ tier: "server" }] : [],
  },
  mapLicenseToTier: () => "free",
}));
vi.mock("@app/components/shared/stripeCheckout", () => ({
  StripeCheckout: () => <div role="dialog">Checkout</div>,
}));

function Buyer() {
  const checkout = useCheckout();
  return (
    <button onClick={() => void checkout.openCheckout("server")}>
      Add capacity
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("opens on the first click using asynchronously fetched plans", async () => {
  let resolvePlans!: (value: { plans: unknown[] }) => void;
  mocks.getPlans.mockReturnValue(
    new Promise((resolve) => {
      resolvePlans = resolve;
    }),
  );
  render(
    <CheckoutProvider>
      <Buyer />
    </CheckoutProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  expect(mocks.getPlans).toHaveBeenCalledTimes(1);
  resolvePlans({ plans: [{ id: "server-monthly" }] });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("reports failed price loading visibly and allows a retry", async () => {
  expectConsole.error(/Failed to fetch plans/);
  expectConsole.error(/Error opening checkout/);
  mocks.getPlans.mockRejectedValueOnce(new Error("offline"));
  render(
    <CheckoutProvider>
      <Buyer />
    </CheckoutProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  await waitFor(() =>
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: "error" }),
    ),
  );
  mocks.getPlans.mockResolvedValue({ plans: [{ id: "server-monthly" }] });
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
