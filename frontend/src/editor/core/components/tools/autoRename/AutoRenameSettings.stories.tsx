import type { Meta, StoryObj } from "@storybook/react-vite";
import AutoRenameSettings from "@app/components/tools/autoRename/AutoRenameSettings";
import { AutoRenameParameters } from "@app/hooks/tools/autoRename/useAutoRenameParameters";

const meta = {
  title: "Tools/AutoRename/AutoRenameSettings",
  component: AutoRenameSettings,
} satisfies Meta<typeof AutoRenameSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

const baseParameters: AutoRenameParameters = {
  useFirstTextAsFallback: false,
};

export const Default: Story = {
  args: {
    parameters: baseParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: baseParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
