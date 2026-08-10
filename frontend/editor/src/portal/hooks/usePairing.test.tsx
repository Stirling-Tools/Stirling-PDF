import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { PairingView } from "@portal/api/link";

/**
 * The pairing loop has three properties worth pinning, because all three are easy
 * to regress and none is obvious from reading the hook:
 *
 *   1. It adopts a pairing another replica already started rather than replacing
 *      it, which is the whole reason the state lives in the shared database.
 *   2. It fires `onLinked` exactly once, since the caller uses it to close the
 *      dialog and refresh link state.
 *   3. A failed poll leaves the pairing alone instead of surfacing an error.
 */
const { startPairing, fetchPairingStatus, cancelPairing } = vi.hoisted(() => ({
  startPairing: vi.fn(),
  fetchPairingStatus: vi.fn(),
  cancelPairing: vi.fn(),
}));

vi.mock("@portal/api/link", () => ({
  startPairing,
  fetchPairingStatus,
  cancelPairing,
}));

import { usePairing } from "@portal/hooks/usePairing";

const waitingView = (over: Partial<PairingView> = {}): PairingView => ({
  phase: "waiting",
  userCode: "WXYZ-4821",
  verificationUri: "https://s/link",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  intervalSeconds: 5,
  ...over,
});

const idleView: PairingView = {
  phase: "idle",
  userCode: null,
  verificationUri: null,
  expiresAt: null,
  intervalSeconds: 0,
};

let seen: ReturnType<typeof usePairing> | null = null;

// Mount inside act so the hook's async mount effect settles before we assert,
// rather than resolving between render() and the first waitFor.
const mount = async (onLinked?: () => void) => {
  await act(async () => {
    render(<Probe onLinked={onLinked} />);
  });
};

function Probe({ onLinked }: { onLinked?: () => void }) {
  seen = usePairing(true, onLinked);
  return null;
}

describe("usePairing", () => {
  beforeEach(() => {
    seen = null;
    startPairing.mockReset();
    fetchPairingStatus.mockReset();
    cancelPairing.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adopts a pairing another replica already started", async () => {
    fetchPairingStatus.mockResolvedValue(waitingView());

    await mount();

    await waitFor(() => expect(seen?.view?.phase).toBe("waiting"));
    expect(seen?.view?.userCode).toBe("WXYZ-4821");
    // Starting a second pairing would hand the admin a code the other pod is not
    // waiting on, and would strand the first.
    expect(startPairing).not.toHaveBeenCalled();
  });

  it("starts one when nothing is in flight", async () => {
    fetchPairingStatus.mockResolvedValue(idleView);
    startPairing.mockResolvedValue(waitingView({ userCode: "AAAA-2222" }));

    await mount();

    await waitFor(() => expect(startPairing).toHaveBeenCalledTimes(1));
    expect(seen?.view?.userCode).toBe("AAAA-2222");
  });

  it("restarts rather than adopting an expired pairing", async () => {
    fetchPairingStatus.mockResolvedValue({ ...idleView, phase: "expired" });
    startPairing.mockResolvedValue(waitingView());

    await mount();

    await waitFor(() => expect(startPairing).toHaveBeenCalledTimes(1));
  });

  it("fires onLinked once, not on every later render", async () => {
    fetchPairingStatus.mockResolvedValue({ ...idleView, phase: "linked" });
    const onLinked = vi.fn();

    await mount(onLinked);

    await waitFor(() => expect(seen?.view?.phase).toBe("linked"));
    expect(onLinked).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error when the pairing cannot be started", async () => {
    fetchPairingStatus.mockResolvedValue(idleView);
    startPairing.mockRejectedValue(new Error("Bad Gateway"));

    await mount();

    await waitFor(() => expect(seen?.error).toBe("Bad Gateway"));
  });

  it("keeps waiting when a poll fails mid-pairing", async () => {
    vi.useFakeTimers();
    fetchPairingStatus.mockResolvedValueOnce(waitingView());
    await mount();
    await vi.waitFor(() => expect(seen?.view?.phase).toBe("waiting"));

    // A dropped poll must not clear the code the admin is currently typing in.
    fetchPairingStatus.mockRejectedValue(new Error("network"));
    await act(() => vi.advanceTimersByTimeAsync(7000));

    expect(seen?.view?.phase).toBe("waiting");
    expect(seen?.error).toBeNull();
  });

  it("does not poll faster than the advertised interval", async () => {
    vi.useFakeTimers();
    fetchPairingStatus.mockResolvedValue(waitingView({ intervalSeconds: 5 }));
    await mount();
    await vi.waitFor(() => expect(seen?.view?.phase).toBe("waiting"));

    const afterAdopt = fetchPairingStatus.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(fetchPairingStatus.mock.calls.length).toBe(afterAdopt);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetchPairingStatus.mock.calls.length).toBeGreaterThan(afterAdopt);
  });
});
