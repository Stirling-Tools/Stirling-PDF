import type { Meta, StoryObj } from "@storybook/react-vite";
import { componentsFor } from "@portal/mocks/sdkComponents";
import { ComponentGrid } from "@portal/components/catalogue/ComponentGrid";

const meta: Meta<typeof ComponentGrid> = {
  title: "Portal/Components/ComponentGrid",
  component: ComponentGrid,
  parameters: { layout: "padded" },
  args: { components: componentsFor("pro"), tier: "pro", onOpen: () => {} },
};
export default meta;
type Story = StoryObj<typeof ComponentGrid>;

export const Pro: Story = {};

/** Free locks every paid component — the whole grid shows upgrade nudges. */
export const Free: Story = {
  args: { components: componentsFor("free"), tier: "free" },
};

/** Enterprise unlocks the enterprise-only Beta components. */
export const Enterprise: Story = {
  args: { components: componentsFor("enterprise"), tier: "enterprise" },
};
