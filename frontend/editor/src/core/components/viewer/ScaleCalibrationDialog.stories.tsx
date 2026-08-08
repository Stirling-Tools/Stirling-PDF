/**
 * The calibration modal: the user drags a line over a known distance on the
 * page, then tells the viewer how long that line really is.
 *
 * The only thing the dialog knows on open is the measurement it was handed.
 * That measurement decides whether the "measured page distance" line appears at
 * all, and `formatPaperDistance` switches its unit by magnitude (mm below
 * 100 mm, then cm, then m), so the same component reads quite differently for a
 * short line and a long one. The calculated-scale preview only appears once a
 * real-world distance has been typed, so it is not a static state.
 *
 * The unit selector prefers the last unit the user calibrated in, which is read
 * from local storage — `defaultUnit` only applies on a fresh browser profile.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ScaleCalibrationDialog,
  type ScaleCalibrationMeasurement,
} from "@app/components/viewer/ScaleCalibrationDialog";

function measurement(pdfDistancePts: number): ScaleCalibrationMeasurement {
  return {
    start: { pageIndex: 0, x: 100, y: 240 },
    end: { pageIndex: 0, x: 100 + pdfDistancePts, y: 240 },
    pdfDistancePts,
  };
}

const meta: Meta<typeof ScaleCalibrationDialog> = {
  title: "Viewer/ScaleCalibrationDialog",
  component: ScaleCalibrationDialog,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    defaultUnit: "m",
    measurement: measurement(200),
    onApplyScale: () => {},
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ScaleCalibrationDialog>;

/** A line a few centimetres long on the page. */
export const Default: Story = {};

/** A short line, reported in millimetres. */
export const ShortMeasurement: Story = {
  args: { measurement: measurement(36) },
};

/** A line over a metre long, reported in metres. */
export const LongMeasurement: Story = {
  args: { measurement: measurement(3600) },
};

/** Opened without a measurement: the page-distance line has nothing to report. */
export const NoMeasurement: Story = { args: { measurement: null } };
