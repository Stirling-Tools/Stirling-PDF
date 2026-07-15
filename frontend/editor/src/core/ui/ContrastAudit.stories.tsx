import type { Meta, StoryObj } from "@storybook/react";
import { ContrastAuditPanel } from "@app/ui/contrastAudit/ContrastAuditPanel";

// Dev/QA tool — scans every Storybook story for text-on-fill contrast. Pinned to
// the bottom of the sidebar via storySort in .storybook/preview.tsx. The panel
// and its scanning engine live in ./contrastAudit/*.
const meta: Meta<typeof ContrastAuditPanel> = {
  title: "Tools/Contrast Audit",
  component: ContrastAuditPanel,
  parameters: { layout: "padded", a11y: { test: "off" } },
};
export default meta;

type Story = StoryObj<typeof ContrastAuditPanel>;

export const Audit: Story = {};
