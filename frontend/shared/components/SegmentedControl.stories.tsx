import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SegmentedControl } from "@shared/components/SegmentedControl";

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

/** `solid` (default) boxes the track with a raised card and neutral selected
 * text; `subtle` drops the chrome and tints the selected pill + label in the
 * accent colour. The highlight slides between segments, and a divider shows in
 * the gap between two adjacent unselected segments. */
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
          variant="solid"
          value={a}
          onChange={setA}
          options={options}
        />
        <SegmentedControl
          variant="subtle"
          accent="blue"
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

/** Action items (`onClick` instead of `value`) sit inside the control but never
 *  become the active selection — the indicator ignores them. Clicking an action
 *  triggers its own handler without changing the active segment. Useful for
 *  "Upload" buttons embedded in a file-picker tab bar. */
export const WithActionItem: Story = {
  render: () => {
    const [tab, setTab] = useState("saved");
    const [lastAction, setLastAction] = useState<string | null>(null);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { label: "Saved files", value: "saved" },
            { label: "Workbench", value: "workbench" },
            { label: "Upload", onClick: () => setLastAction("Upload clicked") },
          ]}
        />
        {lastAction && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-3)" }}>
            {lastAction}
          </span>
        )}
      </div>
    );
  },
};
