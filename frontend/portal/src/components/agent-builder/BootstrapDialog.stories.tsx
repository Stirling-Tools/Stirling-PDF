import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@shared/components";
import { BootstrapDialog } from "@portal/components/agent-builder/BootstrapDialog";

const meta: Meta<typeof BootstrapDialog> = {
  title: "Portal/AgentBuilder/BootstrapDialog",
  component: BootstrapDialog,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof BootstrapDialog>;

/** Open by default so the dialog is visible in the canvas. */
export const Open: Story = {
  args: { open: true, onClose: () => {} },
};

/** Toggled from a trigger, mirroring how the view drives it. */
export const Triggered: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: "1.5rem" }}>
        <Button onClick={() => setOpen(true)}>Bootstrap from document</Button>
        <BootstrapDialog open={open} onClose={() => setOpen(false)} />
      </div>
    );
  },
};
