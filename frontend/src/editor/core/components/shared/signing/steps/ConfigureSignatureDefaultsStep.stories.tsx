import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfigureSignatureDefaultsStep } from "@app/components/shared/signing/steps/ConfigureSignatureDefaultsStep";
import { SignatureSettings } from "@app/components/tools/certSign/SignatureSettingsInput";

const meta = {
  title: "Shared/Signing/Steps/ConfigureSignatureDefaultsStep",
  component: ConfigureSignatureDefaultsStep,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "28rem" }}>
        <S />
      </div>
    ),
  ],
  args: {
    settings: {},
    onSettingsChange: () => {},
    onBack: () => {},
    onNext: () => {},
  },
} satisfies Meta<typeof ConfigureSignatureDefaultsStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function ConfigureDefaultsDemo({
  disabled,
  initial,
}: {
  disabled?: boolean;
  initial: SignatureSettings;
}) {
  const [settings, setSettings] = useState<SignatureSettings>(initial);
  return (
    <ConfigureSignatureDefaultsStep
      settings={settings}
      onSettingsChange={setSettings}
      onBack={() => {}}
      onNext={() => {}}
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => (
    <ConfigureDefaultsDemo
      initial={{
        showSignature: true,
        pageNumber: 1,
        reason: "Approval",
        location: "London, UK",
        showLogo: true,
        includeSummaryPage: false,
      }}
    />
  ),
};

export const InvisibleSignature: Story = {
  render: () => (
    <ConfigureDefaultsDemo
      initial={{
        showSignature: false,
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ConfigureDefaultsDemo
      disabled
      initial={{
        showSignature: true,
        pageNumber: 2,
        reason: "Review",
        location: "Remote",
      }}
    />
  ),
};
