import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SegmentedControl } from "@app/ui/SegmentedControl";

const meta: Meta<typeof SegmentedControl> = {
  title: "Primitives/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = {
  render: () => {
    const [v, setV] = useState("medium");
    return (
      <SegmentedControl
        value={v}
        onChange={setV}
        options={[
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
        ]}
      />
    );
  },
};

export const FullWidth: Story = {
  render: () => {
    const [v, setV] = useState("pdf");
    return (
      <div style={{ width: 320 }}>
        <SegmentedControl
          fullWidth
          value={v}
          onChange={setV}
          options={[
            { label: "PDF", value: "pdf" },
            { label: "Image", value: "image" },
            { label: "Word", value: "word" },
          ]}
        />
      </div>
    );
  },
};

/** `primary` (default) shows an accent-filled active pill; `secondary` drops the
 * track chrome and tints the active pill + label in the accent colour. The
 * highlight slides between segments. */
export const Variants: Story = {
  render: () => {
    const [a, setA] = useState("viewer");
    const [b, setB] = useState("viewer");
    const options = [
      { label: "Viewer", value: "viewer" },
      { label: "Page Editor", value: "pages" },
      { label: "Active Files", value: "files" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SegmentedControl
          variant="primary"
          value={a}
          onChange={setA}
          options={options}
        />
        <SegmentedControl
          variant="secondary"
          accent="default"
          value={b}
          onChange={setB}
          options={options}
        />
      </div>
    );
  },
};

export const Small: Story = {
  render: () => {
    const [v, setV] = useState("pages");
    return (
      <SegmentedControl
        size="sm"
        value={v}
        onChange={setV}
        options={[
          { label: "Pages", value: "pages" },
          { label: "Files", value: "files" },
        ]}
      />
    );
  },
};
