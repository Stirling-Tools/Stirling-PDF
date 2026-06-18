import type { Meta, StoryObj } from "@storybook/react-vite";
import { ROLES } from "@portal/mocks/users";
import { RolesGrid } from "@portal/components/users/RolesGrid";

const meta: Meta<typeof RolesGrid> = {
  title: "Portal/Users/RolesGrid",
  component: RolesGrid,
  parameters: { layout: "padded" },
  args: { roles: ROLES },
};
export default meta;
type Story = StoryObj<typeof RolesGrid>;

/** The five org roles, most → least privileged. */
export const Default: Story = {};
