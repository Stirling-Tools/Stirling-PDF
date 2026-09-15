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
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeDisabled();
});
