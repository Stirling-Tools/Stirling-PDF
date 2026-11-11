import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CheckoutProvider,
  useCheckout,
} from "@editor/contexts/CheckoutContext";
import { expectConsole } from "@editor/tests/failOnConsole";

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  pricing: vi.fn(),
  preferred: vi.fn(() => "usd"),
  getLicenseInfo: vi.fn(),
  getUsers: vi.fn(),
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
vi.mock("@editor/constants/planConstants", () => ({
  usePlanFeatures: () => mocks.features,
  usePlanHighlights: () => mocks.highlights,
}));
vi.mock("@editor/contexts/LicenseContext", () => ({
  useLicense: () => ({ refetchLicense: mocks.refetch }),
}));
vi.mock("@editor/services/supabaseClient", () => ({
  isSupabaseConfigured: true,
}));
vi.mock("@editor/utils/currencyDetection", () => ({
  getPreferredCurrency: mocks.preferred,
}));
vi.mock("@editor/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@editor/services/userManagementService", () => ({
  userManagementService: { getUsers: mocks.getUsers },
}));
vi.mock("@editor/services/licenseService", () => ({
  default: {
    getPlans: mocks.getPlans,
    getLicenseInfo: mocks.getLicenseInfo,
    groupPlansByTier: (plans: unknown[]) =>
      plans.length ? [{ tier: "server" }] : [],
  },
  mapLicenseToTier: () => "free",
}));
vi.mock("@editor/components/shared/stripeCheckout", () => ({
  StripeCheckout: ({
    onSuccess,
    onClose,
    onContactSales,
  }: {
    onSuccess: (sessionId: string) => void;
    onClose: () => void;
    onContactSales?: () => void;
  }) => (
    <div role="dialog">
      Checkout
      <button onClick={() => onSuccess("cs_test")}>Pay</button>
      <button onClick={onClose}>Close</button>
      <button onClick={onContactSales}>Contact sales</button>
    </div>
  ),
}));

function Buyer({
  linked = false,
  onClose,
  onContactSales,
}: {
  linked?: boolean;
  onClose?: (paid: boolean) => void;
  onContactSales?: () => void;
}) {
  const checkout = useCheckout();
  return (
    <button
      onClick={() =>
        void checkout.openCheckout("server", {
          ...(linked ? { resolveCurrency: mocks.pricing } : {}),
          onClose,
          onContactSales,
        })
      }
    >
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
  // The click loads the Supabase client before fetching plans.
  await waitFor(() => expect(mocks.getPlans).toHaveBeenCalledTimes(1));
  resolvePlans({ plans: [{ id: "server-monthly" }] });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(mocks.getLicenseInfo).not.toHaveBeenCalled();
  expect(mocks.getUsers).not.toHaveBeenCalled();
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

it("resolves a linked customer's currency before fetching Team prices", async () => {
  mocks.preferred.mockReturnValue("gbp");
  mocks.pricing.mockResolvedValue({ currency: "aud", currencyLocked: true });
  mocks.getPlans.mockResolvedValue({ plans: [{ id: "server-monthly" }] });
  render(
    <CheckoutProvider>
      <Buyer linked />
    </CheckoutProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(mocks.pricing).toHaveBeenCalledWith("gbp");
  expect(mocks.getPlans).toHaveBeenCalledWith(
    mocks.features,
    mocks.highlights,
    "aud",
    true,
    "server",
  );
});

it("tells the caller on close whether that checkout was paid for", async () => {
  mocks.getPlans.mockResolvedValue({ plans: [{ id: "server-monthly" }] });
  const onClose = vi.fn();
  render(
    <CheckoutProvider>
      <Buyer onClose={onClose} />
    </CheckoutProvider>,
  );
  const open = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
    await screen.findByRole("dialog");
  };
  // Closing refetches plans; let that settle before the next step.
  const close = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {});
  };

  await open();
  fireEvent.click(screen.getByRole("button", { name: "Pay" }));
  await close();
  expect(onClose).toHaveBeenLastCalledWith(true);

  // A later checkout starts unpaid.
  await open();
  await close();
  expect(onClose).toHaveBeenLastCalledWith(false);
});

it("closes the checkout before handing a buyer to Enterprise", async () => {
  mocks.getPlans.mockResolvedValue({ plans: [{ id: "server-monthly" }] });
  const onContactSales = vi.fn();
  render(
    <CheckoutProvider>
      <Buyer onContactSales={onContactSales} />
    </CheckoutProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
  await screen.findByRole("dialog");

  fireEvent.click(screen.getByRole("button", { name: "Contact sales" }));
  await act(async () => {});

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onContactSales).toHaveBeenCalledTimes(1);
});
