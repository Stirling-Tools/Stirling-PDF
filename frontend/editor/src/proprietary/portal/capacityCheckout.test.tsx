import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// LicenseProvider reads app config; CheckoutProvider reaches for the licence API and Supabase
// on mount. None of that is what this test is about, so it is all stubbed flat.
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { isAdmin: false } }),
  AppConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@app/services/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));
vi.mock("@app/services/userManagementService", () => ({
  userManagementService: { getUsers: vi.fn() },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
// Reads the i18n locale, which is not initialised under vitest.
vi.mock("@app/utils/currencyDetection", () => ({
  getPreferredCurrency: () => "usd",
  detectCurrencyFromLocale: () => "usd",
}));

import { CapacityCheckoutProvider } from "@app/portal/capacityCheckout";
import { useOptionalCheckout } from "@app/contexts/CheckoutContext";

function Probe() {
  const checkout = useOptionalCheckout();
  return <span>{checkout ? "checkout available" : "no checkout"}</span>;
}

/**
 * The portal mounts as a sibling of the editor's AppProviders, not inside it, so the editor's
 * CheckoutProvider is not an ancestor of any portal route. That is why the Users page could
 * render its capacity line with no way to buy: the context resolved to null. This pins the seam
 * that fixes it.
 */
describe("CapacityCheckoutProvider", () => {
  it("puts the checkout context in scope for portal routes", () => {
    render(
      <MemoryRouter>
        <CapacityCheckoutProvider>
          <Probe />
        </CapacityCheckoutProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("checkout available")).toBeInTheDocument();
  });

  it("without it, a portal route has no checkout to open", () => {
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByText("no checkout")).toBeInTheDocument();
  });
});
