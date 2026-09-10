import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Which usage page this instance has one of. The unlinked half must not go anywhere near the
 * wallet: {@code onWalletLoaded} reports `linked` as a fact, and a browser can hold a SaaS session
 * with no link to this server, so loading a wallet there flipped the whole portal to linked.
 */
const gate = { gated: false, loading: false, available: true };
const connect = vi.fn();
const applyLinkFacts = vi.fn();

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ ...gate, connect, guard: (f: unknown) => f }),
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => applyLinkFacts,
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: vi.fn() }),
}));
vi.mock("@portal/views/Usage", () => ({
  Usage: ({ onWalletLoaded }: { onWalletLoaded?: (w: unknown) => void }) => {
    onWalletLoaded?.({ status: "free" });
    return <div data-testid="usage" />;
  },
}));
vi.mock("@portal/components/billing/FreeTierPlanView", () => ({
  FreeTierPlanView: () => <div data-testid="free-tier" />,
}));

import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/processor/usage"]}>
      <PortalBillingGate />
    </MemoryRouter>,
  );

describe("PortalBillingGate — self-hosted", () => {
  beforeEach(() => {
    connect.mockReset();
    applyLinkFacts.mockReset();
    gate.gated = false;
    gate.loading = false;
  });

  it("shows the instance's own meter when there is no account, rather than a bounce", () => {
    gate.gated = true;
    renderGate();
    expect(screen.getByTestId("free-tier")).toBeInTheDocument();
    expect(screen.queryByTestId("usage")).toBeNull();
  });

  it("asks for nothing on the way in", () => {
    gate.gated = true;
    renderGate();
    expect(connect).not.toHaveBeenCalled();
  });

  it("never reports the instance as linked while it is not", () => {
    gate.gated = true;
    renderGate();
    // Keeping the unlinked page off the wallet is what stops the claim.
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });

  it("commits to neither page while the answer is unknown", () => {
    gate.loading = true;
    renderGate();
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(screen.queryByTestId("free-tier")).toBeNull();
  });

  it("renders the wallet page, unchanged, once linked", () => {
    renderGate();
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(screen.queryByTestId("free-tier")).toBeNull();
    expect(applyLinkFacts).toHaveBeenCalledWith(true, false);
  });
});
