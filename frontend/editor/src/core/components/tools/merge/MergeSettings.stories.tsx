import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MergeSettings from "@app/components/tools/merge/MergeSettings";
import { MergeParameters } from "@app/hooks/tools/merge/useMergeParameters";

const meta = {
  title: "tools/merge/MergeSettings",
  component: MergeSettings,
} satisfies Meta<typeof MergeSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

function MergeSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] = useState<MergeParameters>({
    removeDigitalSignature: false,
    generateTableOfContents: false,
  });

  return (
    <MergeSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <MergeSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <MergeSettingsDemo disabled />,
};
