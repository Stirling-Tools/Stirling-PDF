import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Collapsible } from "@app/ui/Collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "Components/Collapsible",
  component: Collapsible,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Collapsible>;

// open/onToggle are a controlled pair, so the stories own the state.
export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ maxWidth: "40rem" }}>
        <Collapsible
          open={open}
          onToggle={() => setOpen((o) => !o)}
          header="Advanced"
        >
          Body content revealed when the section is open.
        </Collapsible>
      </div>
    );
  },
};

// Several independent disclosures stacked in a form-like column.
export const Stacked: Story = {
  render: () => {
    const [open, setOpen] = useState<number | null>(0);
    const sections = ["Trial", "Quote", "Agreement"];
    return (
      <div
        style={{
          maxWidth: "40rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        {sections.map((label, i) => (
          <Collapsible
            key={label}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
            header={label}
          >
            {label} details.
          </Collapsible>
        ))}
      </div>
    );
  },
};
