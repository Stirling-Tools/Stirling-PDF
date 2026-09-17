import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CapacityStage } from "@app/components/shared/stripeCheckout/stages/CapacityStage";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
it("blocks purchasing less than the existing allowance even when usage is lower", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={1}
        setServerQuantity={() => {}}
        currentUsers={40}
        currentLimit={300}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "100" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Review change in Stripe" }),
  ).toBeDisabled();
});

it("shows the new recurring total without inventing the adjustment charge", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={3}
        setServerQuantity={() => {}}
        currentUsers={40}
        currentLimit={300}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("New plan total")).toBeInTheDocument();
  expect(screen.queryByText("Due today")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Stripe will show the exact charge/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review change in Stripe" }),
  ).toBeEnabled();
});
it("keeps payment language for a first purchase", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={1}
        setServerQuantity={() => {}}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Due today")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeEnabled();
});
