import type { Meta, StoryObj } from "@storybook/react-vite";
import { componentsFor } from "@portal/mocks/sdkComponents";
import { ComponentPropsTable } from "@portal/components/catalogue/ComponentPropsTable";

const VIEWER = componentsFor("pro").find((c) => c.id === "viewer")!;

const meta: Meta<typeof ComponentPropsTable> = {
  title: "Portal/Components/ComponentPropsTable",
  component: ComponentPropsTable,
  parameters: { layout: "padded" },
  args: { props: VIEWER.props },
};
export default meta;
type Story = StoryObj<typeof ComponentPropsTable>;

export const Default: Story = {};
