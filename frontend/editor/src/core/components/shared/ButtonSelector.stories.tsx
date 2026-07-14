import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ButtonSelector from "@app/components/shared/ButtonSelector";

/** Reproduces the redaction "Mode" picker (Automatic / Manual). */
const meta: Meta<typeof ButtonSelector> = {
  title: "Shared/ButtonSelector",
  component: ButtonSelector,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ButtonSelector>;

function ModeDemo({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState("automatic");
  return (
    <ButtonSelector
      label="Mode"
      value={value}
      onChange={setValue}
      options={[
        { value: "automatic", label: "Automatic", disabled },
        { value: "manual", label: "Manual", disabled },
      ]}
    />
  );
}

/** Enabled (files present): the selected segment must be dark + readable. */
export const RedactionMode: Story = { render: () => <ModeDemo /> };

/** Both options disabled (no files) — the selected segment must STILL be legible. */
export const DisabledOptions: Story = {
  render: () => <ModeDemo disabled />,
};
