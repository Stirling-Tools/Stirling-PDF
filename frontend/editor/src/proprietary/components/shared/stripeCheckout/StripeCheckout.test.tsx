vi.mock("@app/ui/ActionIcon", () => ({
  ActionIcon: ({
    children,
    onClick,
    "aria-label": label,
  }: {
    children: ReactNode;
    onClick: () => void;
    "aria-label": string;
  }) => (
    <button onClick={onClick} aria-label={label}>
      {children}
    </button>
  ),
}));
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PlanTierGroup } from "@app/services/licenseService";
const service = vi.hoisted(() => ({
  getLicenseInfo: vi.fn(),
  createCheckoutSession: vi.fn(),
}));
vi.mock("@app/services/licenseService", () => ({ default: service }));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@mantine/core", () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock(
  "@app/components/shared/stripeCheckout/hooks/useLicensePolling",
  () => ({ useLicensePolling: () => ({}) }),
);
vi.mock(
  "@app/components/shared/stripeCheckout/hooks/useCheckoutSession",
  () => ({
    useCheckoutSession: () => ({
      createCheckoutSession: service.createCheckoutSession,
    }),
  }),
);
vi.mock("@app/components/shared/stripeCheckout/stages/PaymentStage", () => ({
  PaymentStage: () => <div>Payment details</div>,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/SuccessStage", () => ({
  SuccessStage: () => null,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/ErrorStage", () => ({
  ErrorStage: () => null,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/EmailStage", () => ({
  EmailStage: ({
    emailInput,
    setEmailInput,
    onSubmit,
  }: {
    emailInput: string;
    setEmailInput: (email: string) => void;
    onSubmit: () => void;
  }) => (
    <div>
      Buyer email
      <input
        aria-label="Email"
        value={emailInput}
        onChange={(event) => setEmailInput(event.target.value)}
      />
      <button onClick={onSubmit}>Continue</button>
    </div>
  ),
}));
vi.mock(
  "@app/components/shared/stripeCheckout/stages/PlanSelectionStage",
  () => ({
    PlanSelectionStage: ({
      onSelectPlan,
    }: {
      onSelectPlan: (period: "monthly" | "yearly") => void;
    }) => (
      <div>
        Billing period
        <button onClick={() => onSelectPlan("monthly")}>Monthly</button>
      </div>
    ),
  }),
);
vi.mock("@app/components/shared/stripeCheckout/stages/CapacityStage", () => ({
  CapacityStage: ({
    serverQuantity,
    currentLimit,
    onContinue,
  }: {
    serverQuantity: number;
    currentLimit: number;
    onContinue: () => void;
  }) => (
    <div>
      Capacity: {serverQuantity} blocks; current: {currentLimit}
      <button onClick={onContinue}>Continue to payment</button>
    </div>
  ),
}));
vi.mock("@app/components/shared/StepModalHeader", () => ({
  StepModalHeader: ({ aside }: { aside?: ReactNode }) => <div>{aside}</div>,
}));
import StripeCheckout from "@app/components/shared/stripeCheckout/StripeCheckout";
const planGroup: PlanTierGroup = {
  tier: "server",
  name: "Team",
  features: [],
  highlights: [],
  yearly: null,
  monthly: {
    id: "team",
    name: "Team",
    price: 99,
    currency: "usd",
    period: "month",
    features: [],
    highlights: [],
    lookupKey: "test:team:monthly",
  },
};
describe("capacity checkout entry", () => {
  beforeEach(() => {
    service.getLicenseInfo.mockReset();
  });
  it.each(["SERVER", "ENTERPRISE"])(
    "keeps combined choices for an existing %s licence",
    async (licenseType) => {
      service.getLicenseInfo.mockResolvedValue({
        licenseType,
        licenseKey: "test-license",
      });
      render(
        <StripeCheckout
          opened
          onClose={() => {}}
          planGroup={planGroup}
          combinedChoose
          minimumSeats={250}
          currentLimit={300}
        />,
      );
      expect(
        await screen.findByText("Capacity: 3 blocks; current: 300"),
      ).toBeInTheDocument();
      expect(screen.getByText("Billing period")).toBeInTheDocument();
      expect(screen.queryByText("Buyer email")).not.toBeInTheDocument();
    },
  );
  // The free user is the case that changed: this lane mints the checkout as their Stirling
  // account, so the address comes from the team's billing owner and nobody is asked for one.
  it("does not ask a free user for a billing email either", async () => {
    service.getLicenseInfo.mockResolvedValue({ licenseType: "NORMAL" });
    render(
      <StripeCheckout
        opened
        onClose={() => {}}
        planGroup={planGroup}
        combinedChoose
        minimumSeats={250}
        currentLimit={300}
      />,
    );
    expect(
      await screen.findByText("Capacity: 3 blocks; current: 300"),
    ).toBeInTheDocument();
    expect(screen.getByText("Billing period")).toBeInTheDocument();
    expect(screen.queryByText("Buyer email")).not.toBeInTheDocument();
  });
});

describe("combined checkout for plans without capacity", () => {
  // Two entry paths now, not three: the licence only decides whether an upgrade key travels with
  // the purchase, never whether an address is collected first.
  it.each(["existing license", "no license"])(
    "reaches payment from %s",
    async (entry) => {
      service.getLicenseInfo.mockResolvedValue(
        entry === "existing license"
          ? { licenseType: "ENTERPRISE", licenseKey: "test-license" }
          : { licenseType: "NORMAL" },
      );
      render(
        <StripeCheckout
          opened
          onClose={() => {}}
          planGroup={{ ...planGroup, tier: "enterprise" }}
          combinedChoose
        />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "Monthly" }));
      expect(await screen.findByText("Payment details")).toBeInTheDocument();
      expect(screen.queryByText(/Capacity:/)).not.toBeInTheDocument();
    },
  );
});

it("starts at held capacity and lets payment return to those choices", async () => {
  render(
    <StripeCheckout
      opened
      onClose={() => {}}
      planGroup={planGroup}
      combinedChoose
      minimumSeats={40}
      currentLimit={300}
    />,
  );
  expect(
    await screen.findByText("Capacity: 3 blocks; current: 300"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
  expect(await screen.findByText("Payment details")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "common.back" }));
  expect(
    await screen.findByText("Capacity: 3 blocks; current: 300"),
  ).toBeInTheDocument();
});
