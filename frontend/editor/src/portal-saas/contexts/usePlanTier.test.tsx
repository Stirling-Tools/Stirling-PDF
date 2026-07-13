import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const fetchWallet = vi.fn();
vi.mock("@portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
}));

// Resolves to the SaaS override (src/portal-saas/contexts) via the @portal cascade.
import { usePlanTier } from "@portal/contexts/usePlanTier";

function Probe() {
  return <span data-testid="tier">{usePlanTier()}</span>;
}

describe("usePlanTier (SaaS) — tier from wallet", () => {
  beforeEach(() => {
    fetchWallet.mockReset();
  });

  it("subscribed wallet → pro", async () => {
    fetchWallet.mockResolvedValue({ status: "subscribed" });
    const { getByTestId } = render(<Probe />);
    await waitFor(() => expect(getByTestId("tier").textContent).toBe("pro"));
  });

  it("free wallet → free (also the loading default)", async () => {
    fetchWallet.mockResolvedValue({ status: "free" });
    const { getByTestId } = render(<Probe />);
    // Free before the fetch resolves and after — it never flips to pro.
    expect(getByTestId("tier").textContent).toBe("free");
    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(1));
    expect(getByTestId("tier").textContent).toBe("free");
  });
});
