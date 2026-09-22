import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpendLimitModal } from "@portal/components/billing/SpendLimitModal";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";
import { subscribedWallet } from "@app/billing/walletFixtures";

const updateCap = vi.hoisted(() => vi.fn());
vi.mock("@portal/api/billing", () => ({ updateCap }));
vi.mock("@portal/billing/stripe", () => ({
  getStripePublishableKey: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/{{(.*?)}}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
  }),
}));

describe("Processor spend limit", () => {
  beforeEach(() => {
    updateCap.mockReset().mockResolvedValue(undefined);
  });

  it("keeps custom decimals editable, blocks an empty value and saves the chosen limit", async () => {
    const onClose = vi.fn();
    const onWalletChange = vi.fn();
    render(
      <MantineProvider>
        <SpendLimitModal
          open
          wallet={subscribedWallet}
          onClose={onClose}
          onWalletChange={onWalletChange}
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const input = screen.getByRole("textbox", { name: "Monthly spend limit" });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save limit" })).toBeDisabled();
    expect(updateCap).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "125.50" } });
    expect(input).toHaveValue("$125.50");
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(updateCap).toHaveBeenCalledWith(125.5);
    expect(onWalletChange).toHaveBeenCalledOnce();
  });

  it("only saves an uncapped limit after explicitly selecting it", async () => {
    render(
      <MantineProvider>
        <SpendLimitModal open wallet={subscribedWallet} onClose={() => {}} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "No cap" }));
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    await waitFor(() => expect(updateCap).toHaveBeenCalledWith(null));
  });

  it("retains the dialog and chosen amount when saving fails", async () => {
    updateCap.mockRejectedValue(new Error("Unavailable"));
    const onClose = vi.fn();
    render(
      <MantineProvider>
        <SpendLimitModal open wallet={subscribedWallet} onClose={onClose} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
    expect(await screen.findByText("Couldn't save limit")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an explicitly uncapped value when opening Processor signup", () => {
    render(
      <MantineProvider>
        <StripeCheckoutModal
          open
          teamId={42}
          currency="usd"
          initialCapUsd={null}
          onClose={() => {}}
          onComplete={async () => false}
        />
      </MantineProvider>,
    );
    expect(screen.getByText("No cap")).toBeInTheDocument();
    expect(updateCap).not.toHaveBeenCalled();
  });
});
