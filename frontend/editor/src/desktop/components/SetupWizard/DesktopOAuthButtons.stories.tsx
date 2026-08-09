/**
 * Single sign-on buttons on the desktop wizard. Which providers appear is
 * entirely server-driven, so the stories vary that list rather than exposing
 * it as a control. The `mode` prop changes where the buttons point — a
 * Stirling account, or the user's own server.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DesktopOAuthButtons,
  type DesktopSSOProvider,
} from "@app/components/SetupWizard/DesktopOAuthButtons";

const ALL: DesktopSSOProvider[] = [
  { id: "google" },
  { id: "apple" },
  { id: "github" },
  { id: "azure" },
];

const meta: Meta<typeof DesktopOAuthButtons> = {
  title: "Desktop/SetupWizard/OAuthButtons",
  component: DesktopOAuthButtons,
  parameters: { layout: "padded" },
  args: {
    onOAuthSuccess: async () => {},
    onError: () => {},
    isDisabled: false,
    serverUrl: "https://app.stirlingpdf.com",
    providers: ALL,
  },
};
export default meta;

type Story = StoryObj<typeof DesktopOAuthButtons>;

export const AllProviders: Story = {};

/** The common self-hosted case: one provider configured. */
export const SingleProvider: Story = { args: { providers: [{ id: "google" }] } };

/** None configured, so the block renders nothing. */
export const NoProviders: Story = { args: { providers: [] } };

/** Pointing at the user's own server rather than a Stirling account. */
export const SelfHostedMode: Story = {
  args: { mode: "selfHosted", serverUrl: "https://pdf.example.internal" },
};

/** Disabled while a sign-in is already in flight. */
export const Disabled: Story = { args: { isDisabled: true } };

/** A provider the wizard has no icon for still renders with its label. */
export const CustomProvider: Story = {
  args: { providers: [{ id: "keycloak", label: "Keycloak" }] },
};
