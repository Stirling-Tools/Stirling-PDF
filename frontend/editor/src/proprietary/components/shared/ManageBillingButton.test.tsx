vi.mock("@app/contexts/LicenseContext", () => ({
  useLicense: () => ({ licenseInfo: service.license }),
}));
vi.mock("@app/services/supabaseClient", () => ({
  get isSupabaseConfigured() {
    return service.configured;
  },
  supabase: {},
}));
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({
  getLicenseInfo: vi.fn(),
  configured: true,
  license: { enabled: true, licenseKey: "test-installed-license" },
  createBillingPortalSession: vi.fn(),
}));
vi.mock("@app/services/licenseService", () => ({ default: service }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
import { ManageBillingButton } from "@app/components/shared/ManageBillingButton";
it("opens the legacy subscription using the installed licence identity", async () => {
  service.getLicenseInfo.mockResolvedValue({
    licenseKey: "test-installed-license",
  });
  service.createBillingPortalSession.mockResolvedValue({
    url: "https://billing.stripe.com/test",
  });
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  render(
    <MantineProvider>
      <ManageBillingButton returnUrl="https://server.example/settings/billing" />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Manage Billing" }));
  await waitFor(() =>
    expect(service.createBillingPortalSession).toHaveBeenCalledWith(
      "https://server.example/settings/billing",
      "test-installed-license",
    ),
  );
  expect(open).toHaveBeenCalledWith(
    "https://billing.stripe.com/test",
    "_blank",
  );
  open.mockRestore();
});

beforeEach(() => {
  service.configured = true;
  service.license = { enabled: true, licenseKey: "test-installed-license" };
  service.createBillingPortalSession.mockClear();
});
it.each([
  "file:/licenses/enterprise.lic",
  "",
  "00000000-0000-0000-0000-000000000000",
])("hides billing for a non-billing key: %s", (licenseKey) => {
  service.license.licenseKey = licenseKey;
  render(
    <MantineProvider>
      <ManageBillingButton />
    </MantineProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Manage Billing" }),
  ).not.toBeInTheDocument();
  expect(service.createBillingPortalSession).not.toHaveBeenCalled();
});
it("hides billing when the portal service is unconfigured", () => {
  service.configured = false;
  render(
    <MantineProvider>
      <ManageBillingButton />
    </MantineProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Manage Billing" }),
  ).not.toBeInTheDocument();
});
