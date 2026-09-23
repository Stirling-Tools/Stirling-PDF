import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromWebSettings from "@app/components/tools/convert/ConvertFromWebSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta: Meta<typeof ConvertFromWebSettings> = {
  title: "Tools/Convert/ConvertFromWebSettings",
  component: ConvertFromWebSettings,
};
export default meta;
type Story = StoryObj<typeof ConvertFromWebSettings>;

function ConvertFromWebSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] = useState<ConvertParameters>({
    ...defaultParameters,
    fromExtension: "html",
    toExtension: "pdf",
  });

  return (
    <ConvertFromWebSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <ConvertFromWebSettingsDemo /> };

export const Disabled: Story = {
  render: () => <ConvertFromWebSettingsDemo disabled />,
};
