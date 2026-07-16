import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import RedactSingleStepSettings from "@app/components/tools/redact/RedactSingleStepSettings";
import {
  RedactParameters,
  defaultParameters,
} from "@app/hooks/tools/redact/useRedactParameters";

const meta = {
  title: "Tools/Redact/RedactSingleStepSettings",
  component: RedactSingleStepSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RedactSingleStepSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialParameters = defaultParameters,
  disabled,
}: {
  initialParameters?: RedactParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<RedactParameters>(initialParameters);

  return (
    <RedactSingleStepSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <SettingsDemo />,
};

export const AutomaticWithWords: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        wordsToRedact: ["Confidential", "SSN"],
      }}
    />
  ),
};

export const ManualMode: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        mode: "manual",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo
      disabled
      initialParameters={{
        ...defaultParameters,
        wordsToRedact: ["Confidential"],
      }}
    />
  ),
};
