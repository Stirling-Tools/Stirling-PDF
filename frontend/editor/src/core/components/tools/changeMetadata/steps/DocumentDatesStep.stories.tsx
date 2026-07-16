import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import DocumentDatesStep from "@app/components/tools/changeMetadata/steps/DocumentDatesStep";
import {
  ChangeMetadataParameters,
  defaultParameters,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

const meta = {
  title: "Tools/ChangeMetadata/DocumentDatesStep",
  component: DocumentDatesStep,
} satisfies Meta<typeof DocumentDatesStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function DocumentDatesStepDemo({
  disabled,
  creationDate = null,
  modificationDate = null,
}: {
  disabled?: boolean;
  creationDate?: Date | null;
  modificationDate?: Date | null;
}) {
  const [parameters, setParameters] = useState<ChangeMetadataParameters>({
    ...defaultParameters,
    creationDate,
    modificationDate,
  });

  return (
    <DocumentDatesStep
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <DocumentDatesStepDemo />,
};

export const Filled: Story = {
  render: () => (
    <DocumentDatesStepDemo
      creationDate={new Date("2024-01-15T09:30:00")}
      modificationDate={new Date("2026-06-01T14:00:00")}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <DocumentDatesStepDemo
      disabled
      creationDate={new Date("2024-01-15T09:30:00")}
    />
  ),
};
