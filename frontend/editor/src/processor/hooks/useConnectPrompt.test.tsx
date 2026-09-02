import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * The cadence decision: dismissible, but it always comes back. Persisting "seen" would end the ask
 * after one dismissal, so the marker has to be session scoped and has to be written when the prompt
 * opens rather than when it closes, or an admin who ignores the dialog gets it again on every
 * re-render.
 */
const { connect, gate } = vi.hoisted(() => ({
  connect: vi.fn(),
  gate: { gated: true, loading: false, available: true },
}));

vi.mock("@processor/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ ...gate, connect, guard: (f: unknown) => f }),
}));

import { useConnectPrompt } from "@processor/hooks/useConnectPrompt";

function Probe() {
  useConnectPrompt();
  return null;
}

describe("useConnectPrompt", () => {
  beforeEach(() => {
    connect.mockReset();
    sessionStorage.clear();
    gate.gated = true;
    gate.loading = false;
  });

  it("opens the flow once while unlinked", async () => {
    render(<Probe />);
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  });

  it("does not open again in the same session", async () => {
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    unmount();
    render(<Probe />);
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  });

  it("asks again in a fresh session", async () => {
    render(<Probe />).unmount();
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    sessionStorage.clear();
    render(<Probe />);
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
  });

  it("never persists beyond the session", async () => {
    render(<Probe />);
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(localStorage.length).toBe(0);
  });

  it("stays quiet when the instance is not gated", async () => {
    gate.gated = false;
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 0));
    expect(connect).not.toHaveBeenCalled();
  });

  it("waits for the capability rather than prompting on an unknown", async () => {
    gate.loading = true;
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 0));
    expect(connect).not.toHaveBeenCalled();
  });
});
