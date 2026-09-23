import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToPdfxSettings from "@app/components/tools/convert/ConvertToPdfxSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";
import { StirlingFile } from "@app/types/fileContext";

const meta = {
  title: "Tools/Convert/ConvertToPdfxSettings",
  component: ConvertToPdfxSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    selectedFiles: [],
  },
} satisfies Meta<typeof ConvertToPdfxSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component renders no UI — it only reconciles the "outputFormat" field
// on mount — so the shim just proves it mounts and updates parameters without
// throwing.
const ConvertToPdfxSettingsDemo = (props: {
  initialParameters: ConvertParameters;
  selectedFiles?: StirlingFile[];
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<ConvertParameters>(
    props.initialParameters,
  );

  return (
    <ConvertToPdfxSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      selectedFiles={props.selectedFiles ?? []}
      disabled={props.disabled}
    />
  );
};

export const Default: Story = {
  render: () => (
    <ConvertToPdfxSettingsDemo initialParameters={defaultParameters} />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ConvertToPdfxSettingsDemo initialParameters={defaultParameters} disabled />
  ),
};
