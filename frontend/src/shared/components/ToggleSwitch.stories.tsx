import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";

const meta: Meta<typeof ToggleSwitch> = {
  title: "Primitives/ToggleSwitch",
  component: ToggleSwitch,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    checked: true,
    label: "Encryption at rest",
    size: "md",
    disabled: false,
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    disabled: { control: "boolean" },
    checked: { control: "boolean" },
  },
  render: (args) => {
    function Bound() {
      const [on, setOn] = useState(args.checked);
      return <ToggleSwitch {...args} checked={on} onChange={setOn} />;
    }
    return <Bound />;
  },
};
export default meta;
type Story = StoryObj<typeof ToggleSwitch>;

/** Flip size / checked / disabled / label / description in controls. */
export const Playground: Story = {};

export const WithDescription: Story = {
  args: {
    label: "Auto-promote on golden set pass",
    description:
      "When the eval set passes, the new version is promoted automatically.",
  },
};

export const InContext_SettingsRows: Story = {
  parameters: { layout: "padded" },
  render: () => {
    function Bound() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      const [c, setC] = useState(false);
      const [d, setD] = useState(false);
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: "32rem",
          }}
        >
          <ToggleSwitch
            checked={a}
            onChange={setA}
            label="Encryption at rest"
            description="AES-256 with Stirling-managed keys"
          />
          <ToggleSwitch
            checked={b}
            onChange={setB}
            label="Sign every output"
            description="Tamper-evident manifest covers artifact + run metadata"
          />
          <ToggleSwitch
            checked={c}
            onChange={setC}
            label="Mirror to S3"
            description="Copy sealed artifacts to your bucket for compliance archival"
          />
          <ToggleSwitch
            checked={d}
            onChange={setD}
            label="Send low-confidence to review"
            description="Confidence under 0.85 triggers human review"
          />
        </div>
      );
    }
    return <Bound />;
  },
};
