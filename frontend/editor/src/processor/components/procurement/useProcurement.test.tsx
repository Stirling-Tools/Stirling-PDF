import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Most deal stages are their own visit: a buyer can sit in one for days, so finishing a step hands
 * them back to the deal card rather than gliding on to the next.
 *
 * Two steps are deliberately not like that, and both are easy to regress into the old behaviour.
 * Generating a quote stays open, because the issued quote becomes the builder's review step.
 * Accepting one opens the agreement, because the buyer just took that decision from the card and
 * being returned to it to press a second button reads as a dead end.
 *
 * The failure cases matter most: closing on a failure would tear down the error banner with the
 * modal, and *opening* on a failure would show the buyer an agreement for a deal that never left the
 * quote stage.
 */
const { fetchSnapshot, startAgreement, issueQuote } = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  startAgreement: vi.fn(),
  issueQuote: vi.fn(),
}));

vi.mock("@processor/api/procurement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@processor/api/procurement")>()),
  fetchSnapshot,
  startAgreement,
  issueQuote,
}));
vi.mock("@processor/contexts/useProcessorLinked", () => ({
  useProcessorLinked: () => true,
}));

import {
  useProcurement,
  type ProcurementController,
} from "@processor/components/procurement/useProcurement";
import type { QuoteResult } from "@processor/api/procurement";

const SNAPSHOT = {
  dealId: 1,
  stage: "quote" as const,
  deployment: "cloud",
  seats: 10,
  trialStartedAt: "2026-07-01T00:00:00Z",
  trialEndsAt: "2026-08-01T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  agreementSignedVersion: null,
  latestQuote: null,
};

let ctl: ProcurementController;
function Probe() {
  ctl = useProcurement();
  return null;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchSnapshot.mockReset().mockResolvedValue(SNAPSHOT);
  startAgreement.mockReset().mockResolvedValue(SNAPSHOT);
  issueQuote.mockReset().mockResolvedValue(SNAPSHOT);
});

describe("useProcurement", () => {
  it("opens the agreement once accepting the quote succeeds", async () => {
    mount();
    await waitFor(() => expect(ctl.started).toBe(true));

    await act(async () => {
      await ctl.onAcceptQuote();
    });

    expect(startAgreement).toHaveBeenCalledTimes(1);
    expect(ctl.open).toBe(true);
    expect(ctl.error).toBeNull();
  });

  it("does not open the agreement when accepting fails, and says why", async () => {
    startAgreement.mockRejectedValue(new Error("stripe refused"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await waitFor(() => expect(ctl.started).toBe(true));

    await act(async () => {
      await ctl.onAcceptQuote();
    });

    // The deal never left the quote stage, so there is no agreement to show.
    expect(ctl.open).toBe(false);
    expect(ctl.error).toBe("stripe refused");
    quiet.mockRestore();
  });

  it("keeps an open modal open when accepting fails, so the banner survives", async () => {
    startAgreement.mockRejectedValue(new Error("stripe refused"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await waitFor(() => expect(ctl.started).toBe(true));

    act(() => ctl.setOpen(true));
    await act(async () => {
      await ctl.onAcceptQuote();
    });

    expect(ctl.open).toBe(true);
    expect(ctl.error).toBe("stripe refused");
    quiet.mockRestore();
  });

  it("stays open after generating, so the review step can show the issued quote", async () => {
    mount();
    await waitFor(() => expect(ctl.started).toBe(true));

    act(() => ctl.setOpen(true));
    await act(async () => {
      // Only the id is read on the way out; the priced quote comes back via the snapshot.
      await ctl.onGenerate({ quoteId: "q_1" } as unknown as QuoteResult);
    });

    expect(issueQuote).toHaveBeenCalledWith("q_1");
    expect(ctl.open).toBe(true);
    expect(ctl.error).toBeNull();
  });
});
