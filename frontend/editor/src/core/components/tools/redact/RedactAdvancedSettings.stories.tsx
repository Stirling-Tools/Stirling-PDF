import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import {
  RedactParameters,
  defaultParameters,
} from "@app/hooks/tools/redact/useRedactParameters";

const meta = {
  title: "Tools/Redact/RedactAdvancedSettings",
  component: RedactAdvancedSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RedactAdvancedSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function AdvancedSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<RedactParameters>(defaultParameters);

  return (
    <RedactAdvancedSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <AdvancedSettingsDemo /> };

export const Disabled: Story = {
  render: () => <AdvancedSettingsDemo disabled />,
};
