import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/**
 * The gate answers two questions, and conflating them is the failure that matters: an instance
 * running with the account-link flag off CANNOT link, so gating on link state alone would lock
 * Pipelines, Policies, Users, Sources and Integrations on every default install with no way out.
 */
const { json } = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock("@portal/api/http", () => ({
  apiClient: { local: { json } },
  errorMessage: (e: unknown) => String(e),
}));

import { useConnectGate } from "@portal/hooks/useConnectGate";

function Probe() {
  const { gated, loading, available } = useConnectGate();
  return (
    <span data-testid="state">
      {loading
        ? "loading"
        : `${available ? "available" : "unavailable"}:${gated ? "gated" : "open"}`}
    </span>
  );
}

function renderProbe(linkState: LinkState) {
  return render(
    <PortalTestProviders>
      <LinkProvider initialState={linkState}>
        <UIProvider>
          <Probe />
        </UIProvider>
      </LinkProvider>
    </PortalTestProviders>,
  );
}

const settled = async (expected: string) =>
  waitFor(() => expect(screen.getByTestId("state").textContent).toBe(expected));

describe("useConnectGate", () => {
  beforeEach(() => json.mockReset());

  it("gates an unlinked instance that can link", async () => {
    json.mockResolvedValue({ accountLinkAvailable: true });
    renderProbe("unlinked");
    await settled("available:gated");
  });

  it("does not gate when linking is unavailable, whatever the link state", async () => {
    json.mockResolvedValue({ accountLinkAvailable: false });
    renderProbe("unlinked");
    await settled("unavailable:open");
  });

  it("does not gate a linked instance", async () => {
    json.mockResolvedValue({ accountLinkAvailable: true });
    renderProbe("linked-free");
    await settled("available:open");
  });

  it("treats a missing flag as unavailable rather than gating on a guess", async () => {
    json.mockResolvedValue({});
    renderProbe("unlinked");
    await settled("unavailable:open");
  });

  it("does not gate while the capability is still unknown", async () => {
    json.mockResolvedValue({ accountLinkAvailable: true });
    renderProbe("unlinked");
    expect(screen.getByTestId("state").textContent).toBe("loading");
  });
});
