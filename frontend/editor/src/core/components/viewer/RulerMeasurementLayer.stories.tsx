/**
 * The measurement overlay that sits above a rendered page. Everything here is
 * SVG drawn in screen coordinates: the layer is normally mounted inside the
 * viewer's own <svg>, so these stories supply that wrapper themselves and place
 * measurements at fixed points rather than deriving them from a real page.
 *
 * The label layout is the interesting behaviour — labels are hidden, shown, or
 * expanded depending on zoom, crowding, and which measurement is hovered — so
 * each visibility mode gets a story rather than a control.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  RulerMeasurementLayer,
  type RulerRenderedMeasurement,
} from "@app/components/viewer/RulerMeasurementLayer";
import type { MeasureScale } from "@app/utils/measurementTypes";

const SCALE: MeasureScale = { factor: 0.05, ratio: 100, unit: "m" };

function rendered(
  id: string,
  startS: { x: number; y: number },
  endS: { x: number; y: number },
  measureScale: MeasureScale | null = null,
): RulerRenderedMeasurement {
  const distPts = Math.hypot(endS.x - startS.x, endS.y - startS.y);
  return {
    // Screen and page coordinates coincide here: the stories render at zoom 1
    // against a single page, so no projection is involved.
    measurement: {
      id,
      start: { ...startS, pageIndex: 0 },
      end: { ...endS, pageIndex: 0 },
    },
    startS,
    endS,
    distPts,
    measureScale,
  };
}

const MEASUREMENTS = [
  rendered("a", { x: 80, y: 90 }, { x: 320, y: 90 }),
  rendered("b", { x: 120, y: 150 }, { x: 300, y: 260 }),
  rendered("c", { x: 360, y: 120 }, { x: 480, y: 300 }),
];

/** Close enough together that the crowding rules start dropping idle labels. */
const CROWDED = [
  rendered("a", { x: 60, y: 80 }, { x: 150, y: 80 }),
  rendered("b", { x: 60, y: 110 }, { x: 150, y: 110 }),
  rendered("c", { x: 60, y: 140 }, { x: 150, y: 140 }),
  rendered("d", { x: 60, y: 170 }, { x: 150, y: 170 }),
  rendered("e", { x: 170, y: 80 }, { x: 260, y: 80 }),
  rendered("f", { x: 170, y: 110 }, { x: 260, y: 110 }),
];

const noop = () => {};

const meta: Meta<typeof RulerMeasurementLayer> = {
  title: "Viewer/RulerMeasurementLayer",
  component: RulerMeasurementLayer,
  parameters: { layout: "fullscreen" },
  args: {
    measurements: MEASUREMENTS,
    zoom: 1,
    selectedId: null,
    hoveredId: null,
    labelVisibilityMode: "hideSmall",
    isInteractionPassthroughActive: false,
    onSelect: noop,
    onDelete: noop,
    onHoverChange: noop,
    onClearAll: noop,
    onCycleLabelVisibilityMode: noop,
  },
  render: (args) => (
    <div style={{ background: "var(--c-surface-sunken)", padding: "1rem" }}>
      {/* Coordinates are fixed but the canvas is not, so the viewBox scales the
          page rather than letting a narrow frame scroll it. */}
      <svg
        viewBox="0 0 560 360"
        width="100%"
        style={{
          display: "block",
          background: "var(--c-surface-raised)",
          borderRadius: 4,
        }}
      >
        <RulerMeasurementLayer {...args} />
      </svg>
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof RulerMeasurementLayer>;

export const Default: Story = {};

/** Nothing measured yet: the toolbar controls are not drawn at all. */
export const Empty: Story = { args: { measurements: [] } };

export const Selected: Story = { args: { selectedId: "b" } };

/** Hovering expands the label to its multi-line form. */
export const Hovered: Story = { args: { hoveredId: "a" } };

/** With a scale applied the label gains the converted real-world distance. */
export const Scaled: Story = {
  args: {
    measurements: MEASUREMENTS.map((m) => ({ ...m, measureScale: SCALE })),
    hoveredId: "a",
  },
};

export const LabelsShowAll: Story = { args: { labelVisibilityMode: "showAll" } };

export const LabelsHidden: Story = { args: { labelVisibilityMode: "hideAll" } };

/** hideSmall drops idle labels that would collide; showAll forces them back. */
export const CrowdedHideSmall: Story = { args: { measurements: CROWDED } };

export const CrowdedShowAll: Story = {
  args: { measurements: CROWDED, labelVisibilityMode: "showAll" },
};

/** Mid-draw: the first point is placed and the line follows the cursor. */
export const DrawingInProgress: Story = {
  args: {
    measurements: [],
    firstPoint: { x: 120, y: 120 },
    cursor: { x: 380, y: 240 },
    liveLine: {
      startS: { x: 120, y: 120 },
      endS: { x: 380, y: 240 },
      measureScale: SCALE,
    },
  },
};

/**
 * While another tool owns the pointer the overlay stops taking hits, so its
 * measurements render but do not respond to hover or selection.
 */
export const InteractionPassthrough: Story = {
  args: { isInteractionPassthroughActive: true },
};

/** Zoomed in, the stroke and label sizing compensate so they stay readable. */
export const ZoomedIn: Story = { args: { zoom: 2.5 } };
