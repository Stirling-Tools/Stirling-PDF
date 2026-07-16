import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import StampSetupSettings from "@app/components/tools/addStamp/StampSetupSettings";
import {
  AddStampParameters,
  defaultParameters,
} from "@app/components/tools/addStamp/useAddStampParameters";

const meta = {
  title: "Tools/AddStamp/StampSetupSettings",
  component: StampSetupSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof StampSetupSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  initialParameters = defaultParameters,
  disabled,
  filename,
}: {
  initialParameters?: AddStampParameters;
  disabled?: boolean;
  filename?: string;
}) {
  const [parameters, setParameters] =
    useState<AddStampParameters>(initialParameters);

  return (
    <StampSetupSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
      filename={filename}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };

export const TextStampWithPreview: Story = {
  render: () => (
    <Demo
      initialParameters={{
        ...defaultParameters,
        stampText: "DRAFT - @date",
      }}
      filename="quarterly-report.pdf"
    />
  ),
};

export const ImageStamp: Story = {
  render: () => (
    <Demo
      initialParameters={{
        ...defaultParameters,
        stampType: "image",
      }}
    />
  ),
};

export const Disabled: Story = { render: () => <Demo disabled /> };
