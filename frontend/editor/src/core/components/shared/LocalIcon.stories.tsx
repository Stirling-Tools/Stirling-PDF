import type { Meta, StoryObj } from "@storybook/react-vite";
import LocalIcon from "@app/components/shared/LocalIcon";

const meta: Meta<typeof LocalIcon> = {
  title: "Shared/LocalIcon",
  component: LocalIcon,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: "description",
    width: "2rem",
    height: "2rem",
  },
};

export const NumericSize: Story = {
  args: {
    icon: "download",
    width: 32,
  },
};

export const WithFullCollectionPrefix: Story = {
  args: {
    icon: "material-symbols:error-rounded",
    width: "1.5rem",
  },
};
