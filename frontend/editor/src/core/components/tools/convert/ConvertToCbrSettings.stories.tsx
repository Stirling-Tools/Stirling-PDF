import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToCbrSettings from "@app/components/tools/convert/ConvertToCbrSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertToCbrSettings",
  component: ConvertToCbrSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof ConvertToCbrSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the DPI input interactive in the canvas.
const ConvertToCbrSettingsDemo = (props: {
  initialParameters: ConvertParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<ConvertParameters>(
    props.initialParameters,
  );

  return (
    <ConvertToCbrSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={props.disabled}
    />
  );
};

export const Default: Story = {
  render: () => (
    <ConvertToCbrSettingsDemo initialParameters={defaultParameters} />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ConvertToCbrSettingsDemo initialParameters={defaultParameters} disabled />
  ),
};
