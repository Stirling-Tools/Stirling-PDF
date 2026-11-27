import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import ButtonSelector from "@editor/components/shared/ButtonSelector";

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
        {
          value: "automatic",
          label: "Automatic",
          disabled,
          tooltip: disabled
            ? "Upload files to use automatic redaction"
            : undefined,
        },
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

/** A label behind a tooltip must fit the track like any other: shrink when narrow, recover when wide. */
export const DisabledOptionsResized: Story = {
  render: () => (
    <div data-testid="track" style={{ width: "7rem" }}>
      <ModeDemo disabled />
    </div>
  ),
  play: async ({ canvas }) => {
    const fontSize = (text: string) =>
      getComputedStyle(canvas.getByText(text)).fontSize;

    await waitFor(() => expect(fontSize("Automatic")).not.toBe("14px"));

    canvas.getByTestId("track").style.width = "22rem";
    await waitFor(() => expect(fontSize("Automatic")).toBe("14px"));
  },
};
