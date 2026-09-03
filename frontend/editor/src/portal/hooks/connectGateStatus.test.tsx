import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/** Over the real provider stack: pins apart not-yet-known, never-knowable and truly unlinked. */
const { json, fetchStatus } = vi.hoisted(() => ({
  json: vi.fn(),
  fetchStatus: vi.fn(),
}));
vi.mock("@portal/api/http", () => ({
  apiClient: { local: { json } },
  errorMessage: String,
}));
vi.mock("@portal/api/link", () => ({
  fetchStatus,
  unlinkInstance: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: false,
}));

import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";

function Probe() {
  const { gated, available } = useConnectGate();
  return (
    <span data-testid="g">{`${available ? "avail" : "unavail"}:${gated ? "gated" : "open"}`}</span>
  );
}

const renderStack = () =>
  render(
    <PortalTestProviders>
      <LinkProvider initialState="unlinked" statusKnown={false}>
        <UIProvider>
          <AccountLinkProvider>
            <Probe />
          </AccountLinkProvider>
        </UIProvider>
      </LinkProvider>
    </PortalTestProviders>,
  );

const state = () => screen.getByTestId("g").textContent;
const configSaysAvailable = () =>
  json.mockResolvedValue({ accountLinkAvailable: true });

describe("connect gate and the link status", () => {
  it("stays open while the status is still in flight", async () => {
    configSaysAvailable();
    let resolve!: (v: unknown) => void;
    fetchStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    expect(state()).toContain("open");
    resolve({ linked: true, name: "acme" });
  });

  it("stays open once a linked status arrives", async () => {
    configSaysAvailable();
    fetchStatus.mockResolvedValue({ linked: true, name: "acme" });
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    expect(state()).toContain("open");
  });

  it("stays open when the status call fails, rather than assuming unlinked", async () => {
    configSaysAvailable();
    fetchStatus.mockRejectedValue(
      new Error("401 once the admin session lapsed"),
    );
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    await new Promise((r) => setTimeout(r, 10));
    expect(state()).toContain("open");
  });

  it("still gates once the status says the instance really is unlinked", async () => {
    configSaysAvailable();
    fetchStatus.mockResolvedValue({ linked: false, name: null });
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:gated"));
  });
});
