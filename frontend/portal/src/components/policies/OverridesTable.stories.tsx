import type { Meta, StoryObj } from "@storybook/react-vite";
import { categoriesFor } from "@portal/mocks/policies";
import { OverridesTable } from "@portal/components/policies/OverridesTable";

const ROUTING = categoriesFor("pro").find((c) => c.category === "routing")!;

const meta: Meta<typeof OverridesTable> = {
  title: "Portal/Policies/OverridesTable",
  component: OverridesTable,
  parameters: { layout: "padded" },
  args: { overrides: ROUTING.overrides, onChange: () => {} },
};
export default meta;
type Story = StoryObj<typeof OverridesTable>;

export const Default: Story = {};

/** No overrides — the global default applies to everything. */
export const Empty: Story = {
  args: { overrides: [] },
};
