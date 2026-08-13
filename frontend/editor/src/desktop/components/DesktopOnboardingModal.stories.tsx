/**
 * First-launch onboarding for the desktop app. Two slides share one frame: a
 * welcome panel, then a sign-in panel that hands over to the setup wizard. Which
 * one shows is held in local state and advanced by the user, and the hero
 * artwork, icon and dismiss behaviour all follow it.
 *
 * The modal shows itself only until the user has been through it once, which it
 * records in web storage; the stories clear that record so it opens.
 *
 * Mantine renders the modal into a portal outside the story canvas.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";

const meta: Meta<typeof DesktopOnboardingModal> = {
  title: "Desktop/OnboardingModal",
  component: DesktopOnboardingModal,
  parameters: { layout: "fullscreen" },
  beforeEach: async () => {
    localStorage.removeItem("stirling-desktop-onboarding-seen");
  },
};
export default meta;

type Story = StoryObj<typeof DesktopOnboardingModal>;

/** The opening slide, as it appears on a first launch. */
export const Welcome: Story = {};

/** The second slide, where the setup wizard takes over the body. */
export const SignIn: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: /^Next/ }));
  },
};
