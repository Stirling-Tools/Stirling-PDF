import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Billing asks for the connection with the dialog, not by replacing the page. The page must render
 * either way: a prompt page whose only content is "you cannot see this page" is a worse version of
 * the dialog that follows it, and dismissing the dialog has to land somewhere real.
 */
const gate = { gated: false, loading: false, available: true };
const connect = vi.fn();

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ ...gate, connect, guard: (f: unknown) => f }),
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => vi.fn(),
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: vi.fn() }),
}));
vi.mock("@portal/views/Usage", () => ({
  Usage: () => <div data-testid="usage" />,
}));

import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

describe("PortalBillingGate — self-hosted", () => {
  beforeEach(() => {
    connect.mockReset();
    gate.gated = false;
  });

  it("asks for the connection on arrival when unconnected", () => {
    gate.gated = true;
    render(<PortalBillingGate />);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("still renders the page behind the ask", () => {
    gate.gated = true;
    render(<PortalBillingGate />);
    expect(screen.getByTestId("usage")).toBeInTheDocument();
  });

  it("asks for nothing once connected", () => {
    render(<PortalBillingGate />);
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByTestId("usage")).toBeInTheDocument();
  });
});
