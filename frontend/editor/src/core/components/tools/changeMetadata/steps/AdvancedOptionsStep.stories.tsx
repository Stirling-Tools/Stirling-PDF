import type { Meta, StoryObj } from "@storybook/react-vite";
import AdvancedOptionsStep from "@app/components/tools/changeMetadata/steps/AdvancedOptionsStep";
import { defaultParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { TrappedStatus } from "@app/types/metadata";

const meta = {
  title: "Tools/ChangeMetadata/Steps/AdvancedOptionsStep",
  component: AdvancedOptionsStep,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    addCustomMetadata: () => {},
    removeCustomMetadata: () => {},
    updateCustomMetadata: () => {},
  },
} satisfies Meta<typeof AdvancedOptionsStep>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomMetadata: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      trapped: TrappedStatus.TRUE,
      customMetadata: [{ id: "1", key: "CustomField", value: "CustomValue" }],
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
