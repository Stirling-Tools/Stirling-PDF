import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

/**
 * The billing page's CTA is driven entirely by this hook's derived status, so the
 * quote → invoice → none classification (and the leader/team gate that keeps the
 * RPC from firing) are what the guards below lock down.
 */
const { getLatestBundleQuote } = vi.hoisted(() => ({
  getLatestBundleQuote: vi.fn(),
}));
vi.mock("@portal/billing/stripe", () => ({ getLatestBundleQuote }));

import { useBundleFlowState } from "@portal/hooks/useBundleFlowState";
import type { LatestBundleQuote } from "@portal/billing/stripe";

const baseQuote: LatestBundleQuote = {
  quoteId: 7,
  users: 25,
  posturePolicies: 4,
  sizeMult: 1.2,
  pipelineMult: 1,
  poolCredits: 576000,
  priceMinor: 480000,
  currency: "usd",
  consentedAt: null,
  stripeQuoteId: "qt_1",
  stripeQuoteNumber: "QT-0007",
  stripeRef: null,
  validUntil: "2026-08-16T00:00:00Z",
};

let latest: ReturnType<typeof useBundleFlowState>;
function Probe({
  teamId,
  enabled,
}: {
  teamId: number | null;
  enabled?: boolean;
}) {
  latest = useBundleFlowState(teamId, enabled);
  return null;
}

beforeEach(() => {
  getLatestBundleQuote.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("useBundleFlowState", () => {
  it("classifies no open quote as 'none'", async () => {
    getLatestBundleQuote.mockResolvedValue(null);
    render(<Probe teamId={1} />);
    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.status).toBe("none");
    expect(latest.latest).toBeNull();
    expect(getLatestBundleQuote).toHaveBeenCalledWith(1);
  });

  it("classifies an un-accepted quote as 'quote'", async () => {
    getLatestBundleQuote.mockResolvedValue({ ...baseQuote, stripeRef: null });
    render(<Probe teamId={1} />);
    await waitFor(() => expect(latest.status).toBe("quote"));
    expect(latest.latest?.quoteId).toBe(7);
  });

  it("classifies an accepted quote (invoice awaiting payment) as 'invoice'", async () => {
    getLatestBundleQuote.mockResolvedValue({ ...baseQuote, stripeRef: "in_1" });
    render(<Probe teamId={1} />);
    await waitFor(() => expect(latest.status).toBe("invoice"));
  });

  it("stays 'none' and never reads the RPC when disabled", async () => {
    render(<Probe teamId={1} enabled={false} />);
    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.status).toBe("none");
    expect(getLatestBundleQuote).not.toHaveBeenCalled();
  });

  it("stays 'none' and never reads the RPC without a team", async () => {
    render(<Probe teamId={null} />);
    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.status).toBe("none");
    expect(getLatestBundleQuote).not.toHaveBeenCalled();
  });

  it("falls back to 'none' when the RPC rejects (no backend / not a leader)", async () => {
    getLatestBundleQuote.mockRejectedValue(new Error("42501"));
    render(<Probe teamId={1} />);
    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.status).toBe("none");
  });

  it("re-reads on refresh() so a freshly-minted invoice flips the status", async () => {
    getLatestBundleQuote.mockResolvedValueOnce(null);
    render(<Probe teamId={1} />);
    await waitFor(() => expect(latest.status).toBe("none"));

    getLatestBundleQuote.mockResolvedValueOnce({
      ...baseQuote,
      stripeRef: "in_1",
    });
    act(() => latest.refresh());
    await waitFor(() => expect(latest.status).toBe("invoice"));
    expect(getLatestBundleQuote).toHaveBeenCalledTimes(2);
  });
});
