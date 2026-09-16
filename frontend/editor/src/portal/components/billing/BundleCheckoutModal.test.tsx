import { MantineProvider } from "@mantine/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { subscribedWallet } from "@app/billing/walletFixtures";
import type { LatestBundleQuote } from "@portal/billing/stripe";

const api = vi.hoisted(() => ({
  getLatestBundleQuote: vi.fn(),
  upsertBundleQuote: vi.fn(),
  createBundleStripeQuote: vi.fn(),
  acceptBundleStripeQuote: vi.fn(),
  finalizeBundleInvoice: vi.fn(),
}));
vi.mock("@portal/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@portal/billing/stripe")>()),
  ...api,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/{{(.*?)}}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
  }),
}));

function showCheckout() {
  return render(
    <MantineProvider>
      <BundleCheckoutModal open wallet={subscribedWallet} onClose={() => {}} />
    </MantineProvider>,
  );
}

describe("annual credit purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    api.getLatestBundleQuote.mockResolvedValue(null);
    api.finalizeBundleInvoice.mockResolvedValue({
      invoiceId: "in_test",
      status: "open",
      hostedInvoiceUrl: null,
      invoicePdf: null,
    });
    api.upsertBundleQuote.mockResolvedValue({
      quoteId: 7,
      status: "draft",
      validUntil: "2027-01-01",
    });
    api.createBundleStripeQuote.mockResolvedValue({
      stripeQuoteId: "qt_test",
      stripeQuoteNumber: "Q-7",
    });
  });
  afterEach(cleanup);

  it("quotes the chosen credit pool independently of Team seats, without accepting it", async () => {
    showCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "$24,000" }));
    expect(screen.queryByText("Total users")).not.toBeInTheDocument();
    expect(screen.getByText("$20,000.00")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.upsertBundleQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        users: null,
        poolCredits: 2_400_000,
        priceMinor: 2_000_000,
        posturePolicies: 1,
        sizeMult: 1,
        pipelineMult: 1,
        consented: false,
      }),
    );
    expect(api.acceptBundleStripeQuote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "$24,000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.createBundleStripeQuote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "$12,000" }));
    fireEvent.click(screen.getByRole("button", { name: "$24,000" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.createBundleStripeQuote).toHaveBeenCalledTimes(2);
  });

  it("resumes an old quote's exact pool, amount and currency even if the wallet rate changed", async () => {
    const latest: LatestBundleQuote = {
      quoteId: 7,
      users: 25,
      posturePolicies: 4,
      sizeMult: 1.2,
      pipelineMult: 1,
      poolCredits: 576_000,
      priceMinor: 480_000,
      currency: "gbp",
      consentedAt: null,
      stripeQuoteId: "qt_existing",
      stripeQuoteNumber: "Q-7",
      stripeRef: null,
      validUntil: "2027-01-01",
    };
    api.getLatestBundleQuote.mockResolvedValue(latest);
    showCheckout();
    expect(await screen.findByText("≈ 576,000 credits")).toBeInTheDocument();
    expect(screen.getByText("£4,800.00")).toBeInTheDocument();
    expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Jane Smith"), {
      target: { value: "Test Buyer" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Finalise" }));
    await waitFor(() =>
      expect(api.upsertBundleQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId: 7,
          poolCredits: 576_000,
          priceMinor: 480_000,
          currency: "gbp",
          consented: true,
        }),
      ),
    );
  });

  it("keeps a custom credit pool after reopening and blocks an empty quantity", async () => {
    const view = showCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));
    const input = screen.getByRole("textbox", { name: "Year size" });
    fireEvent.change(input, { target: { value: "7654.32" } });
    await waitFor(() =>
      expect(
        JSON.parse(sessionStorage.getItem("payg-bundle-calc:42") ?? "{}")
          .poolCredits,
      ).toBe(765432),
    );
    view.unmount();
    showCheckout();
    expect(await screen.findByText("≈ 765,432 credits")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Year size" }), {
      target: { value: "" },
    });
    expect(
      screen.getByRole("button", { name: "Continue to payment" }),
    ).toBeDisabled();
  });
});
