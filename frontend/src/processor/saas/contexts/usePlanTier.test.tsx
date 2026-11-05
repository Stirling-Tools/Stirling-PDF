import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { qk } from "@editor/portal/queries/keys";

const fetchWallet = vi.fn();
vi.mock("@processor/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
}));

// Resolves to the SaaS override (src/portal-saas/contexts) via the @processor cascade.
import { usePlanTier } from "@processor/contexts/usePlanTier";

function Probe() {
  return <span data-testid="tier">{usePlanTier()}</span>;
}

function renderTier() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  };
}

describe("usePlanTier (SaaS) — tier from wallet", () => {
  beforeEach(() => {
    fetchWallet.mockReset();
  });

  it("subscribed wallet → pro", async () => {
    fetchWallet.mockResolvedValue({ status: "subscribed" });
    const { getByTestId } = renderTier();
    await waitFor(() => expect(getByTestId("tier").textContent).toBe("pro"));
  });

  it("free wallet → free (also the loading default)", async () => {
    fetchWallet.mockResolvedValue({ status: "free" });
    const { getByTestId } = renderTier();
    // Free before the fetch resolves and after — it never flips to pro.
    expect(getByTestId("tier").textContent).toBe("free");
    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(1));
    expect(getByTestId("tier").textContent).toBe("free");
  });

  it.each(["trial", "active", "payment_pending"])(
    "%s Enterprise overrides the underlying plan and refreshes on expiry",
    async (status) => {
      fetchWallet.mockResolvedValue({ status: "free", enterprise: { status } });
      const { getByTestId, client } = renderTier();
      await waitFor(() =>
        expect(getByTestId("tier").textContent).toBe("enterprise"),
      );
      act(() =>
        client.setQueryData(qk.wallet(true), {
          status: "free",
          enterprise: null,
        }),
      );
      await waitFor(() => expect(getByTestId("tier").textContent).toBe("free"));
    },
  );
});
