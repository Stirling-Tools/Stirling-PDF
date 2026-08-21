import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const linkState = { isLinked: false };
vi.mock("@portal/contexts/LinkContext", () => ({
  useLink: () => linkState,
  useApplyLinkFacts: () => vi.fn(),
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: vi.fn() }),
}));
vi.mock("@portal/components/billing/LinkAccountPrompt", () => ({
  LinkAccountPrompt: () => <div data-testid="link-prompt" />,
}));
vi.mock("@portal/views/Usage", () => ({
  Usage: () => <div data-testid="usage" />,
}));

import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

describe("PortalBillingGate — self-hosted", () => {
  beforeEach(() => {
    linkState.isLinked = false;
  });

  it("shows the link prompt when unlinked (billing gated on link)", () => {
    linkState.isLinked = false;
    render(<PortalBillingGate />);
    expect(screen.getByTestId("link-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("usage")).not.toBeInTheDocument();
  });

  it("renders the Usage page once linked", () => {
    linkState.isLinked = true;
    render(<PortalBillingGate />);
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(screen.queryByTestId("link-prompt")).not.toBeInTheDocument();
  });
});
