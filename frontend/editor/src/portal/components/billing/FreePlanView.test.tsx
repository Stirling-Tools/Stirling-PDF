import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { LatestBundleQuote } from "@portal/billing/stripe";

const api = vi.hoisted(() => ({
  fetchBundlePricing: vi.fn(),
  fetchCheckoutPricing: vi.fn(),
  getLatestBundleQuote: vi.fn(),
  cancelBundleQuote: vi.fn(),
  createBundleStripeQuote: vi.fn(),
  acceptBundleStripeQuote: vi.fn(),
  upsertBundleQuote: vi.fn(),
  createCheckoutSession: vi.fn(),
}));
vi.mock("@portal/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@portal/billing/stripe")>()),
  ...api,
  getStripePublishableKey: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(.*?)}}/g, (_, name: string) =>
        String(values?.[name] ?? ""),
      ),
  }),
}));

const savedQuote: LatestBundleQuote = {
  quoteId: 7,
  users: 25,
  posturePolicies: 4,
  sizeMult: 1.2,
  pipelineMult: 1,
  poolCredits: 576000,
  priceMinor: 480000,
  currency: "usd",
  consentedAt: null,
  stripeQuoteId: "qt_test",
  stripeQuoteNumber: "QT-0007",
  stripeRef: null,
  validUntil: "2099-01-01T00:00:00Z",
};

function ResumedActivation() {
  const [step, setStep] = useState<"choose" | "prepay" | "payg" | null>(
    "prepay",
  );
  return (
    <FreePlanView wallet={freeWallet} step={step} onStepChange={setStep} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
  api.getLatestBundleQuote.mockResolvedValue(savedQuote);
  api.fetchCheckoutPricing.mockResolvedValue({
    currency: "usd",
    currencyLocked: false,
    unitAmountMinor: 1,
  });
  api.fetchBundlePricing.mockResolvedValue({
    currency: "usd",
    unitAmountMinor: 1,
  });
});

describe("Processor activation navigation", () => {
  it("uses the customer currency instead of the wallet display default", async () => {
    api.fetchCheckoutPricing.mockResolvedValue({
      currency: "cad",
      currencyLocked: true,
      unitAmountMinor: 1.5,
    });
    render(
      <MantineProvider env="test">
        <FreePlanView
          wallet={{ ...freeWallet, currency: "usd" }}
          step="payg"
          onStepChange={vi.fn()}
        />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    const limit = screen.getByRole("textbox", { name: "Monthly spend limit" });
    fireEvent.change(limit, { target: { value: "100" } });
    expect(limit).toHaveValue("CAD 100");
  });

  it("returns from a saved quote to monthly limit selection without cancelling or purchasing", async () => {
    render(
      <MantineProvider env="test">
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    const limit = screen.getByRole("textbox", { name: "Monthly spend limit" });
    fireEvent.change(limit, { target: { value: "250" } });
    expect(limit).toHaveValue("$250");
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.acceptBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns from the monthly limit to the same annual quote without minting another", async () => {
    render(
      <MantineProvider env="test">
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy credits" }));
    expect(await screen.findByText("Prepay the year")).toBeInTheDocument();
    expect(api.getLatestBundleQuote).toHaveBeenCalledTimes(2);
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
  });

  it("keeps Cancel for a subscribed team's standalone top-up", async () => {
    const onClose = vi.fn();
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={onClose} />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Pay as you go" }),
    ).not.toBeInTheDocument();
  });

  it("reprices an unaccepted USD quote at the customer's GBP rate before checkout", async () => {
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 0.75,
    });
    api.upsertBundleQuote.mockResolvedValue({ quoteId: 7 });
    api.createBundleStripeQuote.mockResolvedValue({
      stripeQuoteId: "qt_gbp",
      stripeQuoteNumber: null,
    });
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(await screen.findByText("£3,600.00")).toBeInTheDocument();
    expect(screen.queryByText("$4,800.00")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await waitFor(() =>
      expect(api.upsertBundleQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "gbp",
          priceMinor: 360000,
          poolCredits: 576000,
        }),
      ),
    );
    expect(api.createBundleStripeQuote).toHaveBeenCalledOnce();
  });

  it("lets a new customer select a configured quote currency and reprices before issuing it", async () => {
    api.fetchBundlePricing.mockImplementation(
      (_teamId: number, currency = "usd") =>
        Promise.resolve({
          currency,
          unitAmountMinor: currency === "gbp" ? 0.75 : 1,
          availableCurrencies: ["usd", "gbp"],
          currencyLocked: false,
        }),
    );
    api.upsertBundleQuote.mockResolvedValue({ quoteId: 7 });
    api.createBundleStripeQuote.mockResolvedValue({
      stripeQuoteId: "qt_gbp",
      stripeQuoteNumber: null,
    });
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    const selector = await screen.findByRole("textbox", {
      name: "Quote currency",
    });
    expect(selector).toHaveValue("USD");
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole("option", { name: "GBP" }));
    expect(await screen.findByText("£3,600.00")).toBeInTheDocument();
    expect(api.fetchBundlePricing).toHaveBeenCalledWith(
      subscribedWallet.teamId,
      "gbp",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await waitFor(() =>
      expect(api.upsertBundleQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "gbp",
          priceMinor: 360000,
        }),
      ),
    );
  });

  it("locks the quote selector to the customer's established Stripe currency", async () => {
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 0.75,
      availableCurrencies: ["gbp"],
      currencyLocked: true,
    });
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    const selector = await screen.findByRole("textbox", {
      name: "Quote currency",
    });
    expect(selector).toHaveValue("GBP");
    expect(selector).toBeDisabled();
  });

  it("blocks new purchases when authoritative pricing cannot be loaded", async () => {
    api.fetchBundlePricing.mockRejectedValue(new Error("Pricing unavailable"));
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(await screen.findByText("Pricing unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to payment" }),
    ).toBeDisabled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
  });

  it("keeps an issued GBP invoice accessible even when current pricing is unavailable", async () => {
    api.fetchBundlePricing.mockRejectedValue(new Error("Pricing unavailable"));
    api.getLatestBundleQuote.mockResolvedValue({
      ...savedQuote,
      currency: "gbp",
      stripeRef: "in_existing",
    });
    api.acceptBundleStripeQuote.mockResolvedValue({
      invoiceId: "in_existing",
      status: "open",
      invoicePdf: null,
      hostedInvoiceUrl: null,
    });
    render(
      <MantineProvider env="test">
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(
      await screen.findByRole("button", { name: "Pay online" }),
    ).toBeEnabled();
    expect(screen.getByText("£4,800.00")).toBeInTheDocument();
    expect(screen.queryByText("Pricing unavailable")).not.toBeInTheDocument();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
  });
});

it("blocks payment when the Processor price cannot be resolved", async () => {
  api.fetchCheckoutPricing.mockRejectedValue(new Error("Pricing unavailable"));
  render(
    <MantineProvider env="test">
      <FreePlanView wallet={freeWallet} step="payg" onStepChange={vi.fn()} />
    </MantineProvider>,
  );
  expect(await screen.findByText("Pricing unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeDisabled();
  expect(api.createCheckoutSession).not.toHaveBeenCalled();
});
it("uses the resolved Processor rate and refreshes currency when reopened", async () => {
  api.fetchCheckoutPricing.mockResolvedValue({
    currency: "gbp",
    currencyLocked: false,
    unitAmountMinor: 2,
  });
  const view = (step: "payg" | null) => (
    <MantineProvider env="test">
      <FreePlanView wallet={freeWallet} step={step} onStepChange={vi.fn()} />
    </MantineProvider>
  );
  const { rerender } = render(view("payg"));
  expect(
    await screen.findByText("£0.02 each · billed as used"),
  ).toBeInTheDocument();
  rerender(view(null));
  api.fetchCheckoutPricing.mockResolvedValue({
    currency: "aud",
    currencyLocked: true,
    unitAmountMinor: 3,
  });
  rerender(view("payg"));
  expect(await screen.findByText(/0.03 each/)).toBeInTheDocument();
  expect(api.fetchCheckoutPricing).toHaveBeenCalledTimes(2);
});
