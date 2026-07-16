import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromEbookSettings from "@app/components/tools/convert/ConvertFromEbookSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertFromEbookSettings",
  component: ConvertFromEbookSettings,
} satisfies Meta<typeof ConvertFromEbookSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

function ConvertFromEbookSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<ConvertParameters>(defaultParameters);

  return (
    <ConvertFromEbookSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <ConvertFromEbookSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <ConvertFromEbookSettingsDemo disabled />,
};
