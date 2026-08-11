import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PairingView } from "@portal/api/link";
import { PairingPanelView } from "@portal/components/account-link/PairingPanelView";

/**
 * Every state of the pairing panel (device grant, RFC 8628). The panel is pure,
 * so these are props only: no network, no waiting out a real ten minute code.
 */
const meta: Meta<typeof PairingPanelView> = {
  title: "Portal/AccountLink/PairingPanelView",
  component: PairingPanelView,
  parameters: { layout: "padded" },
  args: {
    view: null,
    secondsLeft: null,
    loading: false,
    error: null,
    onRetry: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PairingPanelView>;

const waiting: PairingView = {
  phase: "waiting",
  userCode: "WXYZ-4821",
  verificationUri: "https://stirling.com/link",
  expiresAt: null,
  intervalSeconds: 5,
};

/** The main state: a live code, on screen, waiting for a team owner to approve. */
export const Waiting: Story = {
  args: { view: waiting, secondsLeft: 587 },
};

/** Late in the code's life, so the countdown is the thing drawing the eye. */
export const AboutToExpire: Story = {
  args: { view: waiting, secondsLeft: 24 },
};

/**
 * The instance has a code but no expiry yet, which happens if SaaS omitted the
 * lifetime. The wait line falls back to prose rather than rendering "null".
 */
export const WaitingWithoutCountdown: Story = {
  args: { view: waiting, secondsLeft: null },
};

/** First status read still in flight. */
export const Loading: Story = {
  args: { loading: true },
};

/** Nobody approved in time. The only way out is a fresh code. */
export const Expired: Story = {
  args: {
    view: { ...waiting, phase: "expired", userCode: null },
    secondsLeft: 0,
  },
};

/** Someone actively declined it on the Stirling site, which is worth saying plainly. */
export const Declined: Story = {
  args: { view: { ...waiting, phase: "denied", userCode: null } },
};

/** Approved: the credential is already stored server-side by this point. */
export const Linked: Story = {
  args: { view: { ...waiting, phase: "linked", userCode: null } },
};

/** The instance could not reach Stirling at all, usually egress rules. */
export const CannotReachStirling: Story = {
  args: { error: "Bad Gateway" },
};
