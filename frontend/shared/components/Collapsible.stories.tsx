import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Collapsible } from "@shared/components/Collapsible";

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
          header={<strong>Section title</strong>}
          aside={<span style={{ fontSize: "0.75rem" }}>3 items</span>}
        >
          <div style={{ padding: "0.875rem", borderTop: "1px solid #eee" }}>
            Body content revealed when the section is open.
          </div>
        </Collapsible>
      </div>
    );
  },
};

// Stacked instances form an accordion; each section toggles independently.
export const Accordion: Story = {
  render: () => {
    const [open, setOpen] = useState<number | null>(0);
    const sections = ["Trial", "Quote", "Agreement"];
    return (
      <div
        style={{
          maxWidth: "40rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {sections.map((label, i) => (
          <Collapsible
            key={label}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
            header={<strong>{label}</strong>}
          >
            <div style={{ padding: "0.875rem", borderTop: "1px solid #eee" }}>
              {label} details.
            </div>
          </Collapsible>
        ))}
      </div>
    );
  },
};
