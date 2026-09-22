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
  fetchBundlePricing: vi.fn(),
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
    <MantineProvider env="test">
      <BundleCheckoutModal open wallet={subscribedWallet} onClose={() => {}} />
    </MantineProvider>,
  );
}

describe("annual credit purchases", () => {
  let restoreLanguages: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    const languages = vi
      .spyOn(navigator, "languages", "get")
      .mockReturnValue(["en-US"]);
    restoreLanguages = () => languages.mockRestore();
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    sessionStorage.clear();
    api.getLatestBundleQuote.mockResolvedValue(null);
    api.fetchBundlePricing.mockResolvedValue({
      currency: "usd",
      unitAmountMinor: 1,
    });
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
  afterEach(() => {
    cleanup();
    restoreLanguages();
  });

  it.each([
    {
      locked: false,
      currencies: ["usd", "gbp"],
      saved: false,
      expected: "GBP",
    },
    { locked: true, currencies: ["usd"], saved: false, expected: "USD" },
    { locked: false, currencies: ["usd"], saved: false, expected: "USD" },
    { locked: false, currencies: ["usd", "gbp"], saved: true, expected: "USD" },
  ])(
    "defaults UK browsers to $expected (locked=$locked, saved=$saved, available=$currencies)",
    async ({ locked, currencies, saved, expected }) => {
      vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
      api.fetchBundlePricing.mockImplementation(
        async (_teamId: number, currency = "usd") => ({
          currency,
          unitAmountMinor: 1,
          currencyLocked: locked,
          availableCurrencies: currencies,
        }),
      );
      if (saved) {
        api.getLatestBundleQuote.mockResolvedValue({
          quoteId: 7,
          users: null,
          posturePolicies: 1,
          sizeMult: 1,
          pipelineMult: 1,
          poolCredits: 1_200_000,
          priceMinor: 1_000_000,
          currency: "usd",
          consentedAt: null,
          stripeQuoteId: "qt_saved",
          stripeQuoteNumber: "Q-7",
          stripeRef: null,
          validUntil: "2027-01-01",
        } satisfies LatestBundleQuote);
      }
      showCheckout();
      expect(
        await screen.findByRole("textbox", { name: "Quote currency" }),
      ).toHaveValue(expected);
      expect(
        screen.getByText(expected === "GBP" ? "£10,000.00" : "$10,000.00"),
      ).toBeInTheDocument();
      expect(api.fetchBundlePricing).toHaveBeenCalledTimes(
        expected === "GBP" ? 2 : 1,
      );
      if (expected === "GBP") {
        expect(api.fetchBundlePricing).toHaveBeenLastCalledWith(42, "gbp");
      }
    },
  );

  it("remembers a manual currency selection ahead of browser detection", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    api.fetchBundlePricing.mockImplementation(
      async (_teamId: number, currency = "usd") => ({
        currency,
        unitAmountMinor: 1,
        currencyLocked: false,
        availableCurrencies: ["usd", "gbp"],
      }),
    );
    const view = showCheckout();
    expect(
      await screen.findByRole("textbox", { name: "Quote currency" }),
    ).toHaveValue("GBP");
    fireEvent.click(screen.getByRole("textbox", { name: "Quote currency" }));
    fireEvent.click(await screen.findByRole("option", { name: "USD" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Quote currency" }),
      ).toHaveValue("USD"),
    );
    view.unmount();
    api.fetchBundlePricing.mockClear();
    showCheckout();
    expect(
      await screen.findByRole("textbox", { name: "Quote currency" }),
    ).toHaveValue("USD");
    expect(api.fetchBundlePricing).toHaveBeenCalledTimes(1);
  });

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

  it("uses Stripe pricing currency for the spend picker and new quote", async () => {
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 2,
      currencyLocked: true,
      availableCurrencies: ["gbp"],
    });
    showCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "£12,000" }));
    expect(
      screen.getByRole("textbox", { name: "Quote currency" }),
    ).toBeDisabled();
    expect(screen.getByText("£10,000.00")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.upsertBundleQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "gbp",
        poolCredits: 600_000,
        priceMinor: 1_000_000,
      }),
    );
  });

  it.each([
    {
      currency: "jpy",
      initialAmount: "JPY 1200000",
      total: "JPY 10,000",
      customAmount: "12345",
      poolCredits: 12_345,
      priceMinor: 10_287,
    },
    {
      currency: "kwd",
      initialAmount: "KWD 1200",
      total: "KWD 10,000.000",
      customAmount: "12345.678",
      poolCredits: 12_345_678,
      priceMinor: 10_288_065,
    },
  ])(
    "uses $currency units for preset and custom spend amounts",
    async ({
      currency,
      initialAmount,
      total,
      customAmount,
      poolCredits,
      priceMinor,
    }) => {
      api.fetchBundlePricing.mockResolvedValue({
        currency,
        unitAmountMinor: 1,
        currencyLocked: true,
        availableCurrencies: [currency],
      });
      showCheckout();
      expect(
        await screen.findByRole("textbox", { name: "Year size" }),
      ).toHaveValue(initialAmount);
      fireEvent.click(
        screen.getByRole("button", {
          name: `${currency.toUpperCase()} 12,000`,
        }),
      );
      expect(screen.getByText(total)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Other" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Year size" }), {
        target: { value: customAmount },
      });
      expect(screen.getByRole("textbox", { name: "Year size" })).toHaveValue(
        `${currency.toUpperCase()} ${customAmount}`,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Continue to payment" }),
      );
      await screen.findByText("Pay for your year");
      expect(api.upsertBundleQuote).toHaveBeenCalledWith(
        expect.objectContaining({ currency, poolCredits, priceMinor }),
      );
    },
  );

  it("refreshes the custom spend amount when the quote currency changes", async () => {
    api.fetchBundlePricing.mockResolvedValue({
      currency: "usd",
      unitAmountMinor: 1,
      currencyLocked: false,
      availableCurrencies: ["usd", "gbp"],
    });
    showCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Year size" }), {
      target: { value: "7654.32" },
    });
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 2,
      currencyLocked: false,
      availableCurrencies: ["usd", "gbp"],
    });
    fireEvent.click(screen.getByRole("textbox", { name: "Quote currency" }));
    fireEvent.click(await screen.findByRole("option", { name: "GBP" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Year size" })).toHaveValue(
        "£15308.64",
      ),
    );
    expect(api.fetchBundlePricing).toHaveBeenLastCalledWith(42, "gbp");
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText("Pay for your year");
    expect(api.upsertBundleQuote).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "gbp", poolCredits: 765_432 }),
    );
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
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 2,
    });
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
