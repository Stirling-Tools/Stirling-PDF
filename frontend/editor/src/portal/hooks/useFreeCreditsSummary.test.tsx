import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
      {credits === null
        ? "none"
        : credits.state === "loading"
          ? "loading"
          : `${credits.remaining}/${credits.total}`}
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

  it("holds the row's space while a linked instance loads its wallet", async () => {
    let release: (v: unknown) => void = () => {};
    fetchWallet.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const el = renderFor("linked-free");
    await waitFor(() => expect(el.textContent).toBe("loading"));
    release({ status: "free", freeRemaining: 247, freeAllowance: 500 });
    await waitFor(() => expect(el.textContent).toBe("247/500"));
  });
});
