import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCasesFor } from "@portal/mocks/gettingStarted";
import { UseCasePicker } from "@portal/components/getting-started/UseCasePicker";
import "@portal/views/GettingStarted.css";

const PRO = useCasesFor("pro");

const meta: Meta<typeof UseCasePicker> = {
  title: "Portal/GettingStarted/UseCasePicker",
  component: UseCasePicker,
  parameters: { layout: "padded" },
  args: { useCases: PRO, selectedId: null, onSelect: () => {} },
};
export default meta;
type Story = StoryObj<typeof UseCasePicker>;

export const Default: Story = {};

/** A selected card gets a ring so the choice survives stepping back. */
export const Selected: Story = { args: { selectedId: PRO[1].id } };

/** Enterprise unlocks an extra vertical on the grid. */
export const Enterprise: Story = {
  args: { useCases: useCasesFor("enterprise") },
};
