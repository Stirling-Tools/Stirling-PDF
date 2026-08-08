/**
 * The scale picker that opens from the measurement toolbar. Presets apply and
 * close immediately; the custom ratio waits for Apply. The panel mirrors an
 * incoming `currentScale` into its own fields, so the stories drive it through
 * that prop rather than reaching into state.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScaleSettingsPanel } from "@app/components/viewer/ScaleSettingsPanel";
import type { MeasureScale } from "@app/utils/measurementTypes";

/** 1:100 in metres — one of the presets, so the panel shows it as selected. */
const PRESET_SCALE: MeasureScale = { factor: 0.05, ratio: 100, unit: "m" };

/** A ratio no preset offers, which leaves the preset row unselected. */
const CUSTOM_SCALE: MeasureScale = { factor: 0.0175, ratio: 35, unit: "ft" };

/** Calibrated scales carry no ratio — the panel labels them "(custom)". */
const CALIBRATED_SCALE: MeasureScale = {
  factor: 0.0223,
  ratio: null,
  unit: "cm",
};

const noop = () => {};

const meta: Meta<typeof ScaleSettingsPanel> = {
  title: "Viewer/ScaleSettingsPanel",
  component: ScaleSettingsPanel,
  // The panel sets its own 300px floor; padded gives it room without the
  // centred frame clipping into a scroll container.
  parameters: { layout: "padded" },
  args: {
    onApplyScale: noop,
    onResetScale: noop,
    onStartCalibration: noop,
    onCancelCalibration: noop,
    onClose: noop,
  },
};
export default meta;

type Story = StoryObj<typeof ScaleSettingsPanel>;

/** No scale set: the active-scale strip is muted and Reset is not offered. */
export const Default: Story = {};

export const PresetSelected: Story = { args: { currentScale: PRESET_SCALE } };

export const CustomRatio: Story = { args: { currentScale: CUSTOM_SCALE } };

export const CalibratedScale: Story = {
  args: { currentScale: CALIBRATED_SCALE },
};

/** Calibration running: the button flips to its active state. */
export const Calibrating: Story = { args: { isCalibrationActive: true } };

/**
 * Calibration is disabled when the viewer supplies no handler for it — the
 * panel is reachable in contexts that cannot start a calibration draw.
 */
export const CalibrationUnavailable: Story = {
  args: { onStartCalibration: undefined },
};
