import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import type { RedactMode } from "@app/hooks/tools/redact/useRedactParameters";

const meta = {
  title: "Tools/Redact/RedactModeSelector",
  component: RedactModeSelector,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
  args: {
    mode: "automatic",
    onModeChange: () => {},
  },
} satisfies Meta<typeof RedactModeSelector>;
export default meta;
type Story = StoryObj<typeof meta>;

function ModeDemo({
  disabled,
  hasAnyFiles,
}: {
  disabled?: boolean;
  hasAnyFiles?: boolean;
}) {
  const [mode, setMode] = useState<RedactMode>("automatic");
  return (
    <RedactModeSelector
      mode={mode}
      onModeChange={setMode}
      disabled={disabled}
      hasAnyFiles={hasAnyFiles}
    />
  );
}

/** Files present: both Automatic and Manual are selectable. */
export const Default: Story = { render: () => <ModeDemo hasAnyFiles /> };

/** No files uploaded yet: both options disabled with a tooltip on Automatic. */
export const NoFiles: Story = {
  render: () => <ModeDemo hasAnyFiles={false} />,
};

/** Selector disabled entirely (e.g. while an operation is running). */
export const Disabled: Story = {
  render: () => <ModeDemo hasAnyFiles disabled />,
};
