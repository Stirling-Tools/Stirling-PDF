import type { Meta, StoryObj } from "@storybook/react-vite";
import SingleLargePageSettings from "@app/components/tools/singleLargePage/SingleLargePageSettings";
import type { SingleLargePageParameters } from "@app/hooks/tools/singleLargePage/useSingleLargePageParameters";

const parameters: SingleLargePageParameters = {};

const meta = {
  title: "Tools/SingleLargePage/SingleLargePageSettings",
  component: SingleLargePageSettings,
} satisfies Meta<typeof SingleLargePageSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
