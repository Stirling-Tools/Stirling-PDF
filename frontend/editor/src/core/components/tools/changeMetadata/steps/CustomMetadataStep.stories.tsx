import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CustomMetadataStep from "@app/components/tools/changeMetadata/steps/CustomMetadataStep";
import {
  ChangeMetadataParameters,
  defaultParameters,
  createCustomMetadataFunctions,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { CustomMetadataEntry } from "@app/types/metadata";

const meta = {
  title: "Tools/ChangeMetadata/CustomMetadataStep",
  component: CustomMetadataStep,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    addCustomMetadata: () => {},
    removeCustomMetadata: () => {},
    updateCustomMetadata: () => {},
  },
} satisfies Meta<typeof CustomMetadataStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function CustomMetadataStepDemo({
  disabled,
  customMetadata = [],
}: {
  disabled?: boolean;
  customMetadata?: CustomMetadataEntry[];
}) {
  const [parameters, setParameters] = useState<ChangeMetadataParameters>({
    ...defaultParameters,
    customMetadata,
  });

  const onParameterChange = <K extends keyof ChangeMetadataParameters>(
    key: K,
    value: ChangeMetadataParameters[K],
  ) => setParameters((prev) => ({ ...prev, [key]: value }));

  const { addCustomMetadata, removeCustomMetadata, updateCustomMetadata } =
    createCustomMetadataFunctions(parameters, onParameterChange);

  return (
    <CustomMetadataStep
      parameters={parameters}
      onParameterChange={onParameterChange}
      disabled={disabled}
      addCustomMetadata={addCustomMetadata}
      removeCustomMetadata={removeCustomMetadata}
      updateCustomMetadata={updateCustomMetadata}
    />
  );
}

export const Default: Story = {
  render: () => <CustomMetadataStepDemo />,
};

export const WithEntries: Story = {
  render: () => (
    <CustomMetadataStepDemo
      customMetadata={[
        { id: "custom1", key: "Department", value: "Finance" },
        { id: "custom2", key: "Reviewed", value: "Yes" },
      ]}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <CustomMetadataStepDemo
      disabled
      customMetadata={[{ id: "custom1", key: "Department", value: "Finance" }]}
    />
  ),
};
