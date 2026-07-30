import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Each deal stage is its own visit: a buyer can sit in one for days, so finishing a step must hand
 * them back to the deal card rather than glide on to the next. The failure case is the one that
 * matters most — closing on a failed action would tear down the error banner with the modal and
 * leave the buyer with no idea why nothing happened.
 */
const { fetchSnapshot, startAgreement } = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  startAgreement: vi.fn(),
}));

vi.mock("@portal/api/procurement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@portal/api/procurement")>()),
  fetchSnapshot,
  startAgreement,
}));
vi.mock("@portal/contexts/usePortalLinked", () => ({
  usePortalLinked: () => true,
}));

import {
  useProcurement,
  type ProcurementController,
} from "@portal/components/procurement/useProcurement";

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
});

describe("useProcurement — a completed step ends on the card", () => {
  it("closes the modal once accepting the quote succeeds", async () => {
    mount();
    await waitFor(() => expect(ctl.started).toBe(true));

    act(() => ctl.setOpen(true));
    expect(ctl.open).toBe(true);

    await act(async () => {
      await ctl.onAcceptQuote();
    });

    expect(startAgreement).toHaveBeenCalledTimes(1);
    expect(ctl.open).toBe(false);
    expect(ctl.error).toBeNull();
  });

  it("keeps the modal open and surfaces the error when the action fails", async () => {
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
});
