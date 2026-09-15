import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@portal/views/Usage", () => ({
  Usage: () => <div data-testid="usage" />,
}));

import { BillingSettingsSection } from "@portal/components/settings/BillingSettingsSection";

describe("PortalBillingGate — SaaS", () => {
  it("renders the Usage page directly, with no link concept", () => {
    render(
      <MemoryRouter initialEntries={["/settings/billing"]}>
        <BillingSettingsSection />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("usage")).toBeInTheDocument();
  });
});
