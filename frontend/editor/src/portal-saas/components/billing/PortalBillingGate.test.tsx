import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("@portal/views/Usage", () => ({
  Usage: ({ onEnterpriseQuote }: { onEnterpriseQuote?: () => void }) => (
    <div data-testid="usage">
      <button onClick={onEnterpriseQuote}>Get enterprise quote</button>
    </div>
  ),
}));

import { BillingSettingsSection } from "@portal/components/settings/BillingSettingsSection";

function Location() {
  return <output>{useLocation().pathname}</output>;
}

describe("PortalBillingGate — SaaS", () => {
  it("renders the Usage page directly, with no link concept", () => {
    render(
      <MemoryRouter initialEntries={["/settings/billing"]}>
        <BillingSettingsSection />
        <Location />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Get enterprise quote" }),
    );
    expect(screen.getByText("/processor/procurement")).toBeInTheDocument();
  });
});
