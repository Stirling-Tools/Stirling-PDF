import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PlanTierGroup } from "@app/services/licenseService";
const service = vi.hoisted(() => ({ getLicenseInfo: vi.fn() }));
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
  () => ({ useCheckoutSession: () => ({}) }),
);
vi.mock("@app/components/shared/stripeCheckout/stages/PaymentStage", () => ({
  PaymentStage: () => null,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/SuccessStage", () => ({
  SuccessStage: () => null,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/ErrorStage", () => ({
  ErrorStage: () => null,
}));
vi.mock("@app/components/shared/stripeCheckout/stages/EmailStage", () => ({
  EmailStage: () => <div>Buyer email</div>,
}));
vi.mock(
  "@app/components/shared/stripeCheckout/stages/PlanSelectionStage",
  () => ({ PlanSelectionStage: () => <div>Billing period</div> }),
);
vi.mock("@app/components/shared/stripeCheckout/stages/CapacityStage", () => ({
  CapacityStage: ({
    serverQuantity,
    currentLimit,
  }: {
    serverQuantity: number;
    currentLimit: number;
  }) => (
    <div>
      Capacity: {serverQuantity} blocks; current: {currentLimit}
    </div>
  ),
}));
vi.mock("@app/components/shared/StepModalHeader", () => ({
  StepModalHeader: () => null,
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
  it("still asks a free user for their billing email", async () => {
    service.getLicenseInfo.mockResolvedValue({ licenseType: "NORMAL" });
    render(
      <StripeCheckout
        opened
        onClose={() => {}}
        planGroup={planGroup}
        combinedChoose
      />,
    );
    expect(await screen.findByText("Buyer email")).toBeInTheDocument();
  });
  it("seeds required capacity when the caller supplies an email", async () => {
    render(
      <StripeCheckout
        opened
        onClose={() => {}}
        planGroup={planGroup}
        combinedChoose
        initialEmail="buyer@example.test"
        minimumSeats={250}
        currentLimit={300}
      />,
    );
    expect(
      await screen.findByText("Capacity: 3 blocks; current: 300"),
    ).toBeInTheDocument();
    expect(service.getLicenseInfo).not.toHaveBeenCalled();
  });
});
