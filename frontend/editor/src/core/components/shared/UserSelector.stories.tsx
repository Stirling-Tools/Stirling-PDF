import type { Meta, StoryObj } from "@storybook/react-vite";
import UserSelector from "@app/components/shared/UserSelector";

/**
 * Fetches `/api/v1/user/users` on mount — unmocked here, so stories render
 * whatever the fetch settles to (loader, then the "no users" empty state).
 */
const meta = {
  title: "Shared/UserSelector",
  component: UserSelector,
  parameters: { layout: "padded" },
  args: {
    value: [],
    onChange: () => {},
  },
} satisfies Meta<typeof UserSelector>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const CustomPlaceholder: Story = {
  args: { placeholder: "Add collaborators..." },
};
