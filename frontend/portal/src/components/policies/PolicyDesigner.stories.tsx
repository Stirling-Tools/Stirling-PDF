import type { Meta, StoryObj } from "@storybook/react-vite";
import { categoriesFor } from "@portal/mocks/policies";
import { PolicyDesigner } from "@portal/components/policies/PolicyDesigner";

const PRO = categoriesFor("pro");
const SECURITY = PRO.find((c) => c.category === "security")!;
const RETENTION = PRO.find((c) => c.category === "retention")!;

const meta: Meta<typeof PolicyDesigner> = {
  title: "Portal/Policies/PolicyDesigner",
  component: PolicyDesigner,
  parameters: { layout: "fullscreen" },
  args: { config: SECURITY, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof PolicyDesigner>;

/** Toggles + selects: encryption, redaction, region, key management. */
export const Security: Story = {};

/** Number fields with unit suffixes plus a select for deletion method. */
export const Retention: Story = {
  args: { config: RETENTION },
};
