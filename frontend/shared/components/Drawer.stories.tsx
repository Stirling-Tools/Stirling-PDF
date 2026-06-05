import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Drawer } from "@shared/components/Drawer";
import { Button } from "@shared/components/Button";

const meta: Meta<typeof Drawer> = {
  title: "Primitives/Drawer",
  component: Drawer,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    side: "right",
    width: "md",
    title: "Pipeline detail",
    subtitle: "COI Compliance · us-east-1",
  },
  argTypes: {
    side: { control: "inline-radio", options: ["left", "right"] },
    width: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
  decorators: [
    (S) => (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "var(--color-bg)",
        }}
      >
        <S />
      </div>
    ),
  ],
  render: (args) => {
    function Bound() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open drawer</Button>
          <Drawer {...args} open={open} onClose={() => setOpen(false)}>
            <p style={{ color: "var(--color-text-3)" }}>
              The drawer body scrolls when its content overflows. The header and
              footer (when present) are sticky.
            </p>
          </Drawer>
        </>
      );
    }
    return <Bound />;
  },
};
export default meta;
type Story = StoryObj<typeof Drawer>;

/** Flip side / width / title / subtitle in controls. */
export const Playground: Story = {};

export const WithFooter: Story = {
  render: () => {
    function Bound() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open drawer</Button>
          <Drawer
            open={open}
            onClose={() => setOpen(false)}
            side="right"
            width="md"
            title="Pipeline detail"
            subtitle="COI Compliance · us-east-1"
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button variant="outline">Edit composition</Button>
                <Button variant="gradient">View runs</Button>
              </>
            }
          >
            <p style={{ color: "var(--color-text-3)" }}>
              Sticky footer demo — scroll the body, footer stays anchored.
            </p>
          </Drawer>
        </>
      );
    }
    return <Bound />;
  },
};
