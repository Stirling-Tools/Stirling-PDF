import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Usage is a page about an account this instance may not have, so it must not render while
 * unconnected. Two things turn on that: dismissing the dialog must not strand the admin on a page
 * with nothing on it, and the page reports `linked` as a fact from a wallet read, so a browser
 * holding a SaaS session with no link to this server must not flip the whole portal to linked.
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
    // Stands in for the page's own wallet read landing.
    onWalletLoaded?.({ status: "free" });
    return <div data-testid="usage" />;
  },
}));

import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/processor/usage"]}>
      <Routes>
        <Route path="/processor/usage" element={<PortalBillingGate />} />
        <Route path="/processor" element={<div data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );

describe("PortalBillingGate — self-hosted", () => {
  beforeEach(() => {
    connect.mockReset();
    applyLinkFacts.mockReset();
    gate.gated = false;
    gate.loading = false;
  });

  it("asks for the connection when reached unconnected", () => {
    gate.gated = true;
    renderGate();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("sends them back rather than onto a page about an account they lack", () => {
    gate.gated = true;
    renderGate();
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("never reports the instance as linked while it is not", () => {
    gate.gated = true;
    renderGate();
    // The page is what calls this, off its own wallet read. Not rendering it is what stops the
    // claim: a live SaaS session in the browser says nothing about this server being linked.
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });

  it("holds while the capability is still unknown, rather than bouncing", () => {
    gate.loading = true;
    renderGate();
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(screen.queryByTestId("home")).toBeNull();
  });

  it("renders the page once connected", () => {
    renderGate();
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(applyLinkFacts).toHaveBeenCalledWith(true, false);
  });
});
