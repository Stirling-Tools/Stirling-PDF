import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromSvgSettings from "@app/components/tools/convert/ConvertFromSvgSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta: Meta<typeof ConvertFromSvgSettings> = {
  title: "Tools/Convert/ConvertFromSvgSettings",
  component: ConvertFromSvgSettings,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ConvertFromSvgSettings>;

function ConvertFromSvgSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<ConvertParameters>(defaultParameters);

  return (
    <ConvertFromSvgSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <ConvertFromSvgSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <ConvertFromSvgSettingsDemo disabled />,
};
