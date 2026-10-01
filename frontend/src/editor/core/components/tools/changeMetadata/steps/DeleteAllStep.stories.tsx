import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import DeleteAllStep from "@app/components/tools/changeMetadata/steps/DeleteAllStep";
import {
  ChangeMetadataParameters,
  defaultParameters,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

const meta = {
  title: "Tools/ChangeMetadata/DeleteAllStep",
  component: DeleteAllStep,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof DeleteAllStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function DeleteAllStepDemo({
  disabled,
  deleteAll = false,
}: {
  disabled?: boolean;
  deleteAll?: boolean;
}) {
  const [parameters, setParameters] = useState<ChangeMetadataParameters>({
    ...defaultParameters,
    deleteAll,
  });

  return (
    <DeleteAllStep
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <DeleteAllStepDemo />,
};

export const Checked: Story = {
  render: () => <DeleteAllStepDemo deleteAll />,
};

export const Disabled: Story = {
  render: () => <DeleteAllStepDemo disabled />,
};
