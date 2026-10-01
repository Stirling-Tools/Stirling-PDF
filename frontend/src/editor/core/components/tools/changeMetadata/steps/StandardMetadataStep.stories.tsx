import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import StandardMetadataStep from "@app/components/tools/changeMetadata/steps/StandardMetadataStep";
import {
  ChangeMetadataParameters,
  defaultParameters,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

const meta = {
  title: "Tools/ChangeMetadata/StandardMetadataStep",
  component: StandardMetadataStep,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof StandardMetadataStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function StandardMetadataStepDemo({
  disabled,
  filled = false,
}: {
  disabled?: boolean;
  filled?: boolean;
}) {
  const [parameters, setParameters] = useState<ChangeMetadataParameters>({
    ...defaultParameters,
    ...(filled
      ? {
          title: "Annual Report 2026",
          author: "Jane Doe",
          subject: "Financial Summary",
          keywords: "finance, report, annual",
          creator: "Stirling PDF",
          producer: "Stirling PDF",
        }
      : {}),
  });

  return (
    <StandardMetadataStep
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <StandardMetadataStepDemo />,
};

export const Filled: Story = {
  render: () => <StandardMetadataStepDemo filled />,
};

export const Disabled: Story = {
  render: () => <StandardMetadataStepDemo disabled filled />,
};
