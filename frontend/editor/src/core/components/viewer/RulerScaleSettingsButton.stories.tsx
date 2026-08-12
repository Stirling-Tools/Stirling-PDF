/**
 * The cog on the ruler toolbar that opens the measurement scale settings.
 *
 * At rest the button is all there is to see: the scale panel lives inside a
 * popover and the label inside a tooltip, both of which only appear once the
 * user interacts. So the current scale, the calibration state and the apply /
 * reset handlers change nothing about the resting render — the only prop that
 * does is `disabled`, which is how the toolbar reflects a document that cannot
 * be measured yet.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RulerScaleSettingsButton } from "@app/components/viewer/RulerScaleSettingsButton";

const meta = {
  title: "Viewer/RulerScaleSettingsButton",
  component: RulerScaleSettingsButton,
  args: {
    label: "Scale settings",
    tooltipPosition: "right",
    currentScale: { factor: 1 / 72, ratio: null, unit: "in" },
    onApplyScale: () => {},
    onResetScale: () => {},
    onStartCalibration: () => {},
    onCancelCalibration: () => {},
  },
} satisfies Meta<typeof RulerScaleSettingsButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No measurable document loaded, so the cog is inert. */
export const Disabled: Story = {
  args: { disabled: true },
};
