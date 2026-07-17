import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromCbzSettings from "@app/components/tools/convert/ConvertFromCbzSettings";
import {
  defaultParameters,
  ConvertParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/ConvertFromCbzSettings",
  component: ConvertFromCbzSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof ConvertFromCbzSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function CbzSettingsDemo({
  disabled,
  initialOptimize = false,
}: {
  disabled?: boolean;
  initialOptimize?: boolean;
}) {
  const [parameters, setParameters] = useState<ConvertParameters>({
    ...defaultParameters,
    cbzOptions: { optimizeForEbook: initialOptimize },
  });

  return (
    <ConvertFromCbzSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <CbzSettingsDemo /> };

export const OptimizedForEbook: Story = {
  render: () => <CbzSettingsDemo initialOptimize />,
};

export const Disabled: Story = {
  render: () => <CbzSettingsDemo disabled />,
};
