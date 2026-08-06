import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@processor/views/Usage", () => ({
  Usage: () => <div data-testid="usage" />,
}));

import { PortalBillingGate } from "@processor/components/billing/PortalBillingGate";

describe("PortalBillingGate — SaaS", () => {
  it("renders the Usage page directly, with no link concept", () => {
    render(<PortalBillingGate />);
    expect(screen.getByTestId("usage")).toBeInTheDocument();
  });
});
