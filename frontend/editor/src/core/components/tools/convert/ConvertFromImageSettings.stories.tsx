import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromImageSettings from "@app/components/tools/convert/ConvertFromImageSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta: Meta<typeof ConvertFromImageSettings> = {
  title: "Tools/Convert/ConvertFromImageSettings",
  component: ConvertFromImageSettings,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ConvertFromImageSettings>;

function ConvertFromImageSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<ConvertParameters>(defaultParameters);

  return (
    <ConvertFromImageSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <ConvertFromImageSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <ConvertFromImageSettingsDemo disabled />,
};
