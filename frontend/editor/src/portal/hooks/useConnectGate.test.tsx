import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const { gated, loading, available, error, retry } = useConnectGate();
  return (
    <>
      <span data-testid="state">
        {loading
          ? "loading"
          : `${available ? "available" : "unavailable"}:${gated ? "gated" : "open"}`}
      </span>
      <span data-testid="error">{error ?? "none"}</span>
      <button type="button" onClick={retry}>
        retry
      </button>
    </>
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
  beforeEach(() => {
    json.mockReset();
  });

  it("does not require an instance status or configuration check on SaaS", async () => {
    json.mockRejectedValue(new Error("No local instance"));
    render(
      <PortalTestProviders>
        <UIProvider>
          <Probe />
        </UIProvider>
      </PortalTestProviders>,
    );
    await settled("unavailable:open");
    expect(json).not.toHaveBeenCalled();
  });

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

  it("reports a configuration failure rather than reading it as linking disabled", async () => {
    json.mockRejectedValue(new Error("Configuration unavailable"));
    renderProbe("unlinked");

    // Not "loading": hanging on a call that already failed is the blank page from #7926.
    await settled("unavailable:open");
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toContain(
        "Configuration unavailable",
      ),
    );
  });

  it("clears the failure on retry and gates on the answer it then gets", async () => {
    json
      .mockRejectedValueOnce(new Error("Configuration unavailable"))
      .mockResolvedValue({ accountLinkAvailable: true });
    renderProbe("unlinked");
    await settled("unavailable:open");

    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    await settled("available:gated");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("honours no dev bypass, in the URL or in storage", async () => {
    window.history.replaceState({}, "", "/processor?bypassConnect=true");
    sessionStorage.setItem("accountLink::dev-bypass", "true");
    json.mockResolvedValue({ accountLinkAvailable: true });
    renderProbe("unlinked");
    await settled("available:gated");
  });
});
