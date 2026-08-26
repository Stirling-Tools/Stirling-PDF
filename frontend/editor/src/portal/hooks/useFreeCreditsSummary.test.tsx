import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { useFreeCreditsSummary } from "@portal/hooks/useFreeCreditsSummary";

const fetchWallet = vi.fn();
vi.mock("@portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
}));

function Probe() {
  const credits = useFreeCreditsSummary();
  return (
    <span data-testid="credits">
      {credits ? `${credits.remaining}/${credits.total}` : "none"}
    </span>
  );
}

function renderFor(initialState: LinkState) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LinkProvider initialState={initialState}>
        <Probe />
      </LinkProvider>
    </QueryClientProvider>,
  ).getByTestId("credits");
}

describe("useFreeCreditsSummary (self-hosted) — wallet behind the link gate", () => {
  beforeEach(() => {
    // The figures persist across mounts now, so isolate the suite from itself.
    localStorage.clear();
    fetchWallet.mockReset();
    fetchWallet.mockResolvedValue({
      status: "free",
      freeRemaining: 247,
      freeAllowance: 500,
    });
  });

  it("unlinked reads no wallet at all", async () => {
    const el = renderFor("unlinked");
    await waitFor(() => expect(el.textContent).toBe("none"));
    expect(fetchWallet).not.toHaveBeenCalled();
  });

  it("linked surfaces the free grant", async () => {
    const el = renderFor("linked-free");
    await waitFor(() => expect(el.textContent).toBe("247/500"));
  });

  it("hides the meter once the team subscribes", async () => {
    // The grant is a lifetime pool that survives subscribing, so a paying team
    // would otherwise sit on a spent meter forever.
    fetchWallet.mockResolvedValue({
      status: "subscribed",
      freeRemaining: 0,
      freeAllowance: 500,
    });
    const el = renderFor("linked-subscribed");
    // The row holds its space while the wallet loads, then drops once the
    // answer says this team is paying.
    await waitFor(() => expect(el.textContent).toBe("none"));
  });

  it("hides the meter when the wallet read fails", async () => {
    fetchWallet.mockRejectedValue(new Error("saas unreachable"));
    const el = renderFor("linked-subscribed");
    await waitFor(() => expect(el.textContent).toBe("none"));
  });

  it("ignores cached figures once the instance is unlinked", async () => {
    // The cache survives an unlink and nothing rewrites it afterwards, so the
    // linkage gate has to cover the seed too, not just the fetch.
    const linked = renderFor("linked-free");
    await waitFor(() => expect(linked.textContent).toBe("247/500"));
    cleanup();

    fetchWallet.mockClear();
    const unlinked = renderFor("unlinked");
    expect(unlinked.textContent).toBe("none");
    expect(fetchWallet).not.toHaveBeenCalled();
  });

  it("shows the last known figures while the wallet reloads", async () => {
    // What stops the row popping in — and resizing the footer — every time the
    // processor mounts.
    const el = renderFor("linked-free");
    await waitFor(() => expect(el.textContent).toBe("247/500"));
    cleanup();

    let release: (v: unknown) => void = () => {};
    fetchWallet.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const second = renderFor("linked-free");
    // Seeded before the refetch lands...
    expect(second.textContent).toBe("247/500");
    release({ status: "free", freeRemaining: 12, freeAllowance: 500 });
    // ...then updated in place, without the row ever being absent.
    await waitFor(() => expect(second.textContent).toBe("12/500"));
  });
});
