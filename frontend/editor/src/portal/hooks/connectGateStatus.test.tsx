import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/**
 * The gate over the real provider stack, which is where it went wrong in the field: a linked
 * instance was still shown the connect prompt and the sidebar button.
 *
 * `linkState` starts at "unlinked" because the type has no third value, and the status that
 * corrects it arrives separately from the app config. Gating on `!isLinked` alone therefore reads
 * "we have not asked yet" as "not linked". These pin the three answers apart: not yet known,
 * never knowable, and actually not linked.
 */
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
  linkInstance: vi.fn(),
  unlinkInstance: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  PENDING_LINK_KEY: "k",
  isSaasSupabaseConfigured: false,
  SAAS_OAUTH_PROVIDERS: [],
  ensureSaasSupabase: () => null,
}));

import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";

function Probe() {
  const { gated, available } = useConnectGate();
  return (
    <span data-testid="g">
      {`${available ? "avail" : "unavail"}:${gated ? "gated" : "open"}`}
    </span>
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
const availableConfig = () =>
  json.mockResolvedValue({ accountLinkAvailable: true });

describe("connect gate and the link status", () => {
  it("stays open while the status is still in flight", async () => {
    availableConfig();
    let resolve!: (v: unknown) => void;
    fetchStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    expect(state()).toContain("open");
    resolve({ linked: true, name: "acme" });
  });

  it("stays open once a linked status arrives", async () => {
    availableConfig();
    fetchStatus.mockResolvedValue({ linked: true, name: "acme" });
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    expect(state()).toContain("open");
  });

  it("stays open when the status call fails, rather than assuming unlinked", async () => {
    availableConfig();
    fetchStatus.mockRejectedValue(
      new Error("401 after the admin session lapsed"),
    );
    renderStack();
    await waitFor(() => expect(state()).toContain("avail"));
    await new Promise((r) => setTimeout(r, 10));
    expect(state()).toContain("open");
  });

  it("still gates once the status says the instance really is unlinked", async () => {
    availableConfig();
    fetchStatus.mockResolvedValue({ linked: false, name: null });
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:gated"));
  });
});
