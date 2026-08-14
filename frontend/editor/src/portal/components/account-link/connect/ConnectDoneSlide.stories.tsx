import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";

/** The wallet is a SaaS read, so it goes to the mock SaaS origin rather than same-origin. */
const wallet = (freeRemaining: number) => ({
  msw: {
    handlers: [
      http.get("http://saas.mock/api/v1/payg/wallet", () =>
        HttpResponse.json({ freeRemaining }),
      ),
    ],
  },
});

/** The wallet read failing, which is what an unprovisioned or lagging team looks like. */
const walletUnavailable = {
  msw: {
    handlers: [
      http.get(
        "http://saas.mock/api/v1/payg/wallet",
        () => new HttpResponse(null, { status: 500 }),
      ),
    ],
  },
};

const meta: Meta<typeof ConnectDoneSlide> = {
  title: "Portal/AccountLink/Connect/DoneSlide",
  component: ConnectDoneSlide,
  parameters: { layout: "padded" },
  args: { onNavigate: () => {} },
};
export default meta;
type Story = StoryObj<typeof ConnectDoneSlide>;

/** A fresh account, with its grant intact. */
export const Default: Story = {
  parameters: wallet(500),
};

/**
 * An account that has already spent most of its grant. The figure is the wallet's, never a
 * hardcoded 500 — the allowance is seeded per team at team creation, not by connecting, and this
 * is the screen where a stale number would be caught.
 */
export const PartlySpent: Story = {
  parameters: wallet(128),
};

/** Spent in full. Zero is a real answer and is shown rather than hidden. */
export const GrantSpent: Story = {
  parameters: wallet(0),
};

/**
 * The wallet could not be read, which is likely for the first moments after connecting. The row is
 * dropped rather than filled with a guess.
 */
export const BalanceUnavailable: Story = {
  parameters: walletUnavailable,
};
