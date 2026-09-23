import type { ReactNode } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PortalProviders } from "@app/portal/PortalProviders";
import { PortalSettingsProviders } from "@app/portal/components/settings/PortalSettingsProviders";
import { useUI } from "@app/portal/contexts/UIContext";
vi.mock("@app/portal/contexts/TierContext", () => ({
  TierProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  AppConfigProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  LicenseProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/contexts/CheckoutContext", () => ({
  CheckoutProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/components/startup/StartupPrompts", () => ({
  StartupPrompts: () => null,
}));
vi.mock("@app/portal/components/PortalChrome", () => ({
  PortalChrome: () => <Trigger />,
}));
function Trigger() {
  const { openLinkModal, publishConnectOutcome } = useUI();
  return (
    <>
      <button onClick={() => openLinkModal("reauth")}>Request renewal</button>
      <button
        onClick={() =>
          publishConnectOutcome({
            mode: "reauth",
            state: "expired",
            sessionRestored: false,
          })
        }
      >
        Publish callback
      </button>
    </>
  );
}
afterEach(cleanup);
it.each(["Processor", "Settings"])(
  "SaaS %s has no link or renewal modal host",
  (surface) => {
    render(
      <MemoryRouter>
        {surface === "Processor" ? (
          <PortalProviders />
        ) : (
          <PortalSettingsProviders>
            <Trigger />
          </PortalSettingsProviders>
        )}
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Request renewal" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish callback" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Renew billing access")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in again")).not.toBeInTheDocument();
  },
);
