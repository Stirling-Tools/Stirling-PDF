import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { LatestBundleQuote } from "@portal/billing/stripe";

const api = vi.hoisted(() => ({
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
    t: (key: string, fallback?: string) => fallback ?? key,
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
  sessionStorage.clear();
  api.getLatestBundleQuote.mockResolvedValue(savedQuote);
});

describe("Processor activation navigation", () => {
  it("returns from a saved quote to monthly limit selection without cancelling or purchasing", async () => {
    render(
      <MantineProvider>
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay as you go" }));
    const limit = screen.getByRole("textbox", { name: "Monthly spend limit" });
    fireEvent.change(limit, { target: { value: "250" } });
    expect(limit).toHaveValue("250");
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.acceptBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns from the monthly limit to the same annual quote without minting another", async () => {
    render(
      <MantineProvider>
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay as you go" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepay a year" }));
    expect(
      await screen.findByText("Calculate your annual payment"),
    ).toBeInTheDocument();
    expect(api.getLatestBundleQuote).toHaveBeenCalledTimes(2);
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
  });

  it("keeps Cancel for a subscribed team's standalone top-up", async () => {
    const onClose = vi.fn();
    render(
      <MantineProvider>
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={onClose} />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Pay as you go" }),
    ).not.toBeInTheDocument();
  });
});
