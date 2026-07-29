import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToCbzSettings from "@app/components/tools/convert/ConvertToCbzSettings";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertToCbzSettings",
  component: ConvertToCbzSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ConvertToCbzSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
