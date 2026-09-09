import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@processor/views/Usage", () => ({
  Usage: () => <div data-testid="usage" />,
}));

import { ProcessorBillingGate } from "@processor/components/billing/ProcessorBillingGate";

describe("ProcessorBillingGate — SaaS", () => {
  it("renders the Usage page directly, with no link concept", () => {
    render(<ProcessorBillingGate />);
    expect(screen.getByTestId("usage")).toBeInTheDocument();
  });
});
