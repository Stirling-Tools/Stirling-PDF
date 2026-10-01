import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import {
  defaultParameters,
  type AddWatermarkParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

// The parent policy form owns the parameters; the story holds that state so edits are live.
function Harness({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] =
    useState<AddWatermarkParameters>(defaultParameters);
  return (
    <div style={{ maxWidth: 480 }}>
      <PolicyWatermarkConfig
        parameters={parameters}
        onChange={setParameters}
        disabled={disabled}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Policies/PolicyWatermarkConfig",
  component: Harness,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** Text-only watermark settings for a policy, with flatten forced on. */
export const Default: Story = {};

/** All fields locked for read-only policy review. */
export const Disabled: Story = {
  args: { disabled: true },
};
