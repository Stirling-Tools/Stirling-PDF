/**
 * Signing in to a self-hosted server from the desktop wizard. The screen
 * carries several states the wizard drives rather than owning: whether SSO is
 * offered at all, whether the server has asked for a second factor, and
 * whether the last attempt failed.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelfHostedLoginScreen } from "@app/components/SetupWizard/SelfHostedLoginScreen";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof SelfHostedLoginScreen> = {
  title: "Desktop/SetupWizard/SelfHostedLoginScreen",
  component: SelfHostedLoginScreen,
  parameters: { layout: "padded" },
  // The wizard's wordmark resolves a logo variant through PreferencesContext.
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
  args: {
    serverUrl: "https://pdf.example.internal",
    onLogin: async () => {},
    onOAuthSuccess: async () => {},
    mfaCode: "",
    setMfaCode: () => {},
    requiresMfa: false,
    loading: false,
    error: null,
  },
};
export default meta;

type Story = StoryObj<typeof SelfHostedLoginScreen>;

/** Username and password only — no SSO configured on this server. */
export const Default: Story = {};

/** The server offers SSO alongside the password form. */
export const WithSSO: Story = {
  args: {
    enabledOAuthProviders: [{ id: "google" }, { id: "github" }] as never,
  },
};

/** Second factor requested, which swaps in the code field. */
export const RequiresMfa: Story = { args: { requiresMfa: true } };

export const MfaWithCode: Story = {
  args: { requiresMfa: true, mfaCode: "418290" },
};

export const WithError: Story = {
  args: { error: "That username and password were not accepted." },
};

/** Signing in, which disables the form while the request is out. */
export const Loading: Story = { args: { loading: true } };

/** A long server address still has to fit the wizard's column. */
export const LongServerUrl: Story = {
  args: { serverUrl: "https://pdf.internal.engineering.example-corp.co.uk" },
};

/** Typing a code for real, so the field tracks input. */
export const InteractiveMfa: Story = {
  render: function InteractiveMfa(args) {
    const [code, setCode] = useState("");
    return (
      <SelfHostedLoginScreen
        {...args}
        requiresMfa
        mfaCode={code}
        setMfaCode={setCode}
      />
    );
  },
};
