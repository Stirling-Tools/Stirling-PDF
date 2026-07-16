import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import RotateAutomationSettings from "@app/components/tools/rotate/RotateAutomationSettings";
import { RotateParameters } from "@app/hooks/tools/rotate/useRotateParameters";

const meta = {
  title: "Tools/Rotate/RotateAutomationSettings",
  component: RotateAutomationSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RotateAutomationSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function RotateDemo({
  disabled,
  initialAngle = 0,
}: {
  disabled?: boolean;
  initialAngle?: number;
}) {
  const [parameters, setParameters] = useState<RotateParameters>({
    angle: initialAngle,
  });

  return (
    <RotateAutomationSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <RotateDemo /> };

export const Rotated90: Story = {
  render: () => <RotateDemo initialAngle={90} />,
};

export const Disabled: Story = { render: () => <RotateDemo disabled /> };
