import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToEpubSettings from "@app/components/tools/convert/ConvertToEpubSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta: Meta<typeof ConvertToEpubSettings> = {
  title: "Tools/Convert/ConvertToEpubSettings",
  component: ConvertToEpubSettings,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ConvertToEpubSettings>;

function ConvertToEpubSettingsDemo({
  toExtension = "epub",
  disabled,
}: {
  toExtension?: string;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<ConvertParameters>({
    ...defaultParameters,
    fromExtension: "docx",
    toExtension,
  });

  const handleParameterChange = <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <ConvertToEpubSettings
      parameters={parameters}
      onParameterChange={handleParameterChange}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <ConvertToEpubSettingsDemo /> };

export const Azw3Output: Story = {
  render: () => <ConvertToEpubSettingsDemo toExtension="azw3" />,
};

export const Disabled: Story = {
  render: () => <ConvertToEpubSettingsDemo disabled />,
};
