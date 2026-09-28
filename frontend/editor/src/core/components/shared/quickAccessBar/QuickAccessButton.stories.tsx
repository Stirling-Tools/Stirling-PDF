import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import QuickAccessButton from "@app/components/shared/quickAccessBar/QuickAccessButton";

const meta = {
  title: "Shared/QuickAccessBar/QuickAccessButton",
  component: QuickAccessButton,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ display: "flex", gap: "1rem" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickAccessButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Icon name="house" size={"1.5rem"} />,
    label: "Home",
    isActive: false,
    ariaLabel: "Home",
  },
};

export const Active: Story = {
  args: {
    icon: <Icon name="house" size={"1.875rem"} />,
    label: "Home",
    isActive: true,
    ariaLabel: "Home",
  },
};

export const Disabled: Story = {
  args: {
    icon: <Icon name="house" size={"1.5rem"} />,
    label: "Home",
    isActive: false,
    ariaLabel: "Home",
    disabled: true,
  },
};
