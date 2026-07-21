import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToImageSettings from "@app/components/tools/convert/ConvertToImageSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta: Meta<typeof ConvertToImageSettings> = {
  title: "Tools/Convert/ConvertToImageSettings",
  component: ConvertToImageSettings,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ConvertToImageSettings>;

function ConvertToImageSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<ConvertParameters>(defaultParameters);

  return (
    <ConvertToImageSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <ConvertToImageSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <ConvertToImageSettingsDemo disabled />,
};
