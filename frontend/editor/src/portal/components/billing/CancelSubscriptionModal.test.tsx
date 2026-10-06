import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelSubscriptionModal } from "@portal/components/billing/CancelSubscriptionModal";
import { subscribedWallet } from "@app/billing/walletFixtures";
import { formatPeriodDate, type Wallet } from "@app/billing";

const api = vi.hoisted(() => {
  class StripeFunctionError extends Error {
    constructor(
      message: string,
      public readonly code?: string,
    ) {
      super(message);
    }
  }
  return {
    StripeFunctionError,
    fetchSubscriptionStates: vi.fn(),
    cancelSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    contactBeforeCancelling: vi.fn(),
  };
});
vi.mock("@portal/billing/stripe", () => api);
const trackCancellation = vi.hoisted(() => vi.fn());
vi.mock("@app/services/analytics", () => ({ trackCancellation }));
vi.mock("@portal/components/procurement/CalendlyInline", () => ({
  CalendlyInline: () => <div>Calendly booking</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/{{(.*?)}}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
  }),
}));

const TEAM_STATE = {
  product: "team",
  subscriptionId: "sub_team",
  status: "active",
  cancelling: false,
  endsAt: null,
  periodEnd: "2026-11-14T00:00:00.000Z",
  interval: "month",
  quantity: 1,
};

const both: Wallet = {
  ...subscribedWallet,
  team: { held: true, licensedUsers: 100, usersInUse: 37 },
  processor: { active: true },
};
const teamOnly: Wallet = { ...both, processor: { active: false } };
const processorOnly: Wallet = {
  ...both,
  team: { held: false, licensedUsers: null, usersInUse: 4 },
};

async function open(
  wallet: Wallet,
  props: Partial<Parameters<typeof CancelSubscriptionModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <MantineProvider>
      <CancelSubscriptionModal
        open
        wallet={wallet}
        email="alex@acme.example"
        onClose={onClose}
        onChanged={onChanged}
        {...props}
      />
    </MantineProvider>,
  );
  // The dialog reads the subscriptions on open; let that settle before interacting.
  await act(async () => {});
  return { onClose, onChanged };
}

const END = formatPeriodDate("2026-11-14T00:00:00.000Z", { year: true });
const radio = (name: string) => screen.getByRole("radio", { name });
const button = (name: string) => screen.getByRole("button", { name });

describe("Cancel subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchSubscriptionStates.mockResolvedValue([TEAM_STATE]);
    api.cancelSubscription.mockResolvedValue([
      {
        ...TEAM_STATE,
        cancelling: true,
        endsAt: "2026-11-14T00:00:00.000Z",
      },
    ]);
    api.resumeSubscription.mockResolvedValue([TEAM_STATE]);
    api.contactBeforeCancelling.mockResolvedValue(undefined);
  });

  it("won't continue until the product and a reason are chosen", async () => {
    await open(both);
    expect(button("Continue")).toBeDisabled();
    fireEvent.click(radio("It costs too much"));
    expect(button("Continue")).toBeDisabled();
    fireEvent.click(radio("Team plan"));
    expect(button("Continue")).toBeEnabled();
  });

  it("needs words when the reason is 'Something else'", async () => {
    await open(teamOnly);
    fireEvent.click(radio("Something else"));
    expect(button("Continue")).toBeDisabled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "What would have made you stay?" }),
      { target: { value: "Budget freeze" } },
    );
    expect(button("Continue")).toBeEnabled();
  });

  it("offers a conversation once, then cancels at the end of the period", async () => {
    const { onChanged } = await open(teamOnly);
    fireEvent.click(radio("It costs too much"));
    fireEvent.click(button("Continue"));
    expect(screen.getByText("Talk to us first")).toBeInTheDocument();
    fireEvent.click(button("Continue cancelling"));
    await screen.findByText(END);
    expect(
      screen.getByText(/The free plan covers 5 users and you have 37/),
    ).toBeInTheDocument();
    fireEvent.click(button("Cancel Team plan"));
    await screen.findByText(
      `Your Team plan ends on ${END}. Everything keeps working until then.`,
    );
    expect(api.cancelSubscription).toHaveBeenCalledWith({
      product: "team",
      reason: "too_expensive",
      detail: undefined,
      competitor: undefined,
      offerShown: undefined,
    });
    expect(onChanged).toHaveBeenCalledWith([
      expect.objectContaining({ product: "team", cancelling: true }),
    ]);
    expect(trackCancellation).toHaveBeenCalledWith("cancel_confirmed", {
      reason: "too_expensive",
      scope: "team",
    });
  });

  it("skips the save step for someone already switching, and records where to", async () => {
    await open(teamOnly);
    fireEvent.click(radio("We're switching to another tool"));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Which tool are you moving to?" }),
      { target: { value: "Acrobat" } },
    );
    fireEvent.click(button("Continue"));
    expect(screen.queryByText("Talk to us first")).not.toBeInTheDocument();
    fireEvent.click(button("Cancel Team plan"));
    await waitFor(() =>
      expect(api.cancelSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "switched_service",
          competitor: "Acrobat",
        }),
      ),
    );
  });

  it("a message reaches us without touching the plan", async () => {
    await open(teamOnly);
    fireEvent.click(radio("It's missing something we need"));
    fireEvent.click(button("Continue"));
    fireEvent.click(button("Send a message"));
    fireEvent.change(
      screen.getByRole("textbox", { name: "What's going on?" }),
      { target: { value: "We need Bates numbering" } },
    );
    fireEvent.click(button("Send message"));
    await screen.findByText("Message sent");
    expect(api.contactBeforeCancelling).toHaveBeenCalledWith({
      product: "team",
      reason: "missing_features",
      message: "We need Bates numbering",
      replyTo: "alex@acme.example",
    });
    expect(api.cancelSubscription).not.toHaveBeenCalled();
  });

  it("says so when today's messages are used up", async () => {
    api.contactBeforeCancelling.mockRejectedValue(
      new api.StripeFunctionError("limit", "contact_limit"),
    );
    await open(teamOnly);
    fireEvent.click(radio("Something isn't working"));
    fireEvent.click(button("Continue"));
    fireEvent.click(button("Send a message"));
    fireEvent.change(
      screen.getByRole("textbox", { name: "What's going on?" }),
      { target: { value: "Exports fail" } },
    );
    fireEvent.click(button("Send message"));
    expect(
      await screen.findByText(
        "You've already sent us three messages today. We'll be in touch.",
      ),
    ).toBeInTheDocument();
  });

  it("points an unused Processor at the spend limit instead", async () => {
    const onLowerSpendLimit = vi.fn();
    const { onClose } = await open(processorOnly, { onLowerSpendLimit });
    fireEvent.click(radio("We don't use it enough"));
    fireEvent.click(button("Continue"));
    fireEvent.click(button("Set a limit"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onLowerSpendLimit).toHaveBeenCalledOnce();
    expect(trackCancellation).not.toHaveBeenCalledWith(
      "cancel_flow_abandoned",
      expect.anything(),
    );
  });

  it("keeping the plan is recorded as an abandoned cancel", async () => {
    const { onClose } = await open(teamOnly);
    fireEvent.click(button("Keep my plan"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(trackCancellation).toHaveBeenCalledWith("cancel_flow_abandoned", {
      step: "reason",
      reason: null,
    });
    expect(api.cancelSubscription).not.toHaveBeenCalled();
  });
});
