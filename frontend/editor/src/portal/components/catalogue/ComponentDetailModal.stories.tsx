import type { Meta, StoryObj } from "@storybook/react-vite";
import { componentsFor } from "@portal/mocks/sdkComponents";
import { ComponentDetailModal } from "@portal/components/catalogue/ComponentDetailModal";

const PRO = componentsFor("pro");
const VIEWER = PRO.find((c) => c.id === "viewer")!;
const TOOLKIT = PRO.find((c) => c.id === "toolkit")!;

const meta: Meta<typeof ComponentDetailModal> = {
  title: "Portal/Components/ComponentDetailModal",
  component: ComponentDetailModal,
  parameters: { layout: "fullscreen" },
  args: { component: VIEWER, unlocked: true, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof ComponentDetailModal>;

export const Unlocked: Story = {};

/** Enterprise-only component opened on a lower tier — shows the upgrade nudge. */
export const Locked: Story = {
  args: { component: TOOLKIT, unlocked: false },
};

export const Closed: Story = {
  args: { component: null },
};
