/**
 * The measurement scale editor behind the ruler's settings button: preset
 * ratios, a custom ratio + unit pair, and the calibration toggle.
 *
 * Everything the panel shows is decided by two props. `currentScale` seeds the
 * form, decides whether a preset button is highlighted (a preset is "selected"
 * only when its parsed ratio equals the active one), fills the active-scale
 * strip, and is the sole reason the Reset button exists. `isCalibrationActive`
 * flips the calibration button between start and cancel — and because the
 * button falls back to disabled when the matching handler is missing, a viewer
 * that cannot calibrate renders it greyed rather than hiding it.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScaleSettingsPanel } from "@app/components/viewer/ScaleSettingsPanel";
import type { MeasureScale } from "@app/utils/measurementTypes";

/** Ratio 1:100 in metres — one of the preset buttons, so it renders selected. */
const PRESET_SCALE: MeasureScale = { factor: 100 / 72, ratio: 100, unit: "m" };

/** A ratio typed by hand: no preset matches, so none is highlighted. */
const CUSTOM_SCALE: MeasureScale = {
  factor: 37.5 / 72,
  ratio: 37.5,
  unit: "ft",
};

/**
 * Calibration produces a factor without an architectural ratio, which the
 * active-scale strip words as "<unit> (custom)".
 */
const CALIBRATED_SCALE: MeasureScale = {
  factor: 0.0254,
  ratio: null,
  unit: "in",
};

const meta: Meta<typeof ScaleSettingsPanel> = {
  title: "Viewer/ScaleSettingsPanel",
  component: ScaleSettingsPanel,
  parameters: { layout: "padded" },
  args: {
    onApplyScale: () => {},
    onResetScale: () => {},
    onStartCalibration: () => {},
    onCancelCalibration: () => {},
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ScaleSettingsPanel>;

/** No scale set yet: empty ratio, no preset selected, no Reset. */
export const Default: Story = {};

/** An active preset ratio — its button is filled and Reset appears. */
export const PresetScale: Story = { args: { currentScale: PRESET_SCALE } };

/** A hand-typed ratio: the form is populated but no preset claims it. */
export const CustomRatio: Story = { args: { currentScale: CUSTOM_SCALE } };

/** A calibrated scale carries no ratio, so the strip reads "in (custom)". */
export const CalibratedScale: Story = {
  args: { currentScale: CALIBRATED_SCALE },
};

/** Mid-calibration: the button becomes the primary "Calibrating" cancel. */
export const Calibrating: Story = {
  args: { currentScale: PRESET_SCALE, isCalibrationActive: true },
};

/** Nothing to start calibration with, so the button is offered but disabled. */
export const CalibrationUnavailable: Story = {
  args: { onStartCalibration: undefined },
};
