/**
 * Placement and formatting for the stamp tool. The three formatting controls —
 * size, rotation, opacity — share one slider, and `_activePill` decides which
 * of them is showing, so each pill gets its own story rather than a control.
 *
 * Position is the same 1–9 keypad grid the page-number tool uses.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import StampPositionFormattingSettings from "@app/components/tools/addStamp/StampPositionFormattingSettings";
import {
  defaultParameters,
  type AddStampParameters,
} from "@app/components/tools/addStamp/useAddStampParameters";

function Demo({
  overrides,
  disabled,
  showPositionGrid = true,
}: {
  overrides?: Partial<AddStampParameters>;
  disabled?: boolean;
  showPositionGrid?: boolean;
}) {
  const [parameters, setParameters] = useState<AddStampParameters>({
    ...defaultParameters,
    ...overrides,
  });
  return (
    <StampPositionFormattingSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
      showPositionGrid={showPositionGrid}
    />
  );
}

const meta: Meta<typeof StampPositionFormattingSettings> = {
  title: "Tools/AddStamp/PositionFormattingSettings",
  component: StampPositionFormattingSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof StampPositionFormattingSettings>;

export const Default: Story = { render: () => <Demo /> };

/** The formatting pills each swap in a different slider. */
export const RotationActive: Story = {
  render: () => <Demo overrides={{ _activePill: "rotation" }} />,
};

export const OpacityActive: Story = {
  render: () => <Demo overrides={{ _activePill: "opacity" }} />,
};

/** An image stamp has no font size, so that control becomes a scale instead. */
export const ImageStamp: Story = {
  render: () => <Demo overrides={{ stampType: "image" }} />,
};

export const ImageStampRotated: Story = {
  render: () => (
    <Demo overrides={{ stampType: "image", _activePill: "rotation" }} />
  ),
};

/** Corners of the placement grid. */
export const TopLeftPosition: Story = {
  render: () => <Demo overrides={{ position: 7 }} />,
};

export const CentrePosition: Story = {
  render: () => <Demo overrides={{ position: 5 }} />,
};

/** Values at the ends of their ranges, where the sliders sit hard over. */
export const FullyRotated: Story = {
  render: () => <Demo overrides={{ _activePill: "rotation", rotation: 180 }} />,
};

export const NearlyTransparent: Story = {
  render: () => <Demo overrides={{ _activePill: "opacity", opacity: 10 }} />,
};

/** Automation drives position numerically, so the grid is hidden there. */
export const WithoutPositionGrid: Story = {
  render: () => <Demo showPositionGrid={false} />,
};

/** Disabled while the tool is running. */
export const Disabled: Story = { render: () => <Demo disabled /> };
