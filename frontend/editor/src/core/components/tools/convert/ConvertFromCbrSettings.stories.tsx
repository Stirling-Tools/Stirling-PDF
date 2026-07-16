import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromCbrSettings from "@app/components/tools/convert/ConvertFromCbrSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertFromCbrSettings",
  component: ConvertFromCbrSettings,
} satisfies Meta<typeof ConvertFromCbrSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the checkbox interactive in the canvas.
const ConvertFromCbrSettingsDemo = (props: {
  initialParameters: ConvertParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<ConvertParameters>(
    props.initialParameters,
  );

  return (
    <ConvertFromCbrSettings
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
    <ConvertFromCbrSettingsDemo initialParameters={defaultParameters} />
  ),
};

export const OptimizeForEbookEnabled: Story = {
  render: () => (
    <ConvertFromCbrSettingsDemo
      initialParameters={{
        ...defaultParameters,
        cbrOptions: { optimizeForEbook: true },
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ConvertFromCbrSettingsDemo
      initialParameters={defaultParameters}
      disabled
    />
  ),
};
