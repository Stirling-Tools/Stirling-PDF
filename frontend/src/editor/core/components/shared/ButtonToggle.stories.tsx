import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ButtonToggle,
  ButtonToggleOption,
} from "@app/components/shared/ButtonToggle";

const meta: Meta<typeof ButtonToggle> = {
  title: "Shared/ButtonToggle",
  component: ButtonToggle,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ButtonToggle>;

const options: ButtonToggleOption[] = [
  {
    value: "automatic",
    label: "Automatic",
    description: "Detect and redact automatically",
  },
  { value: "manual", label: "Manual", description: "Select regions yourself" },
];

function ToggleDemo({
  disabled,
  size,
}: {
  disabled?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const [value, setValue] = useState("automatic");
  return (
    <ButtonToggle
      options={options}
      value={value}
      onChange={setValue}
      disabled={disabled}
      size={size}
    />
  );
}

/** Default toggle with two options, each carrying a label + description. */
export const Default: Story = { render: () => <ToggleDemo /> };

/** Disabled state — the selected segment must still be legible. */
export const Disabled: Story = { render: () => <ToggleDemo disabled /> };

/** Small size variant. */
export const Small: Story = { render: () => <ToggleDemo size="sm" /> };
