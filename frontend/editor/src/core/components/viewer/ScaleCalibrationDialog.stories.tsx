/**
 * Second half of calibration: the user has drawn a line over something of known
 * size, and this dialog turns that into a scale. The measured page distance is
 * given; the real-world distance is what it asks for.
 *
 * The chosen unit is remembered between calibrations, so `defaultUnit` only
 * applies the first time — stories that care about the unit set it explicitly.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ScaleCalibrationDialog,
  type ScaleCalibrationMeasurement,
} from "@app/components/viewer/ScaleCalibrationDialog";

const MEASUREMENT: ScaleCalibrationMeasurement = {
  start: { x: 100, y: 220, pageIndex: 0 },
  end: { x: 388, y: 220, pageIndex: 0 },
  pdfDistancePts: 288,
};

/** Short enough that the derived ratio lands in a different order of magnitude. */
const SHORT_MEASUREMENT: ScaleCalibrationMeasurement = {
  start: { x: 100, y: 220, pageIndex: 0 },
  end: { x: 118, y: 220, pageIndex: 0 },
  pdfDistancePts: 18,
};

const noop = () => {};

const meta: Meta<typeof ScaleCalibrationDialog> = {
  title: "Viewer/ScaleCalibrationDialog",
  component: ScaleCalibrationDialog,
  parameters: { layout: "centered" },
  args: {
    opened: true,
    measurement: MEASUREMENT,
    defaultUnit: "m",
    onApplyScale: noop,
    onClose: noop,
  },
};
export default meta;

type Story = StoryObj<typeof ScaleCalibrationDialog>;

/** Waiting for input: the page distance is shown, the preview is not. */
export const Default: Story = {};

export const ImperialDefault: Story = { args: { defaultUnit: "ft" } };

export const ShortMeasurement: Story = {
  args: { measurement: SHORT_MEASUREMENT },
};

/**
 * Applying with no distance entered is the error path — the dialog can also be
 * opened before a measurement exists, which leaves the page distance blank.
 */
export const NoMeasurement: Story = { args: { measurement: null } };

export const Closed: Story = { args: { opened: false } };
