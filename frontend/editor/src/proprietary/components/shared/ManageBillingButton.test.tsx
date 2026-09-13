import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({
  getLicenseInfo: vi.fn(),
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
