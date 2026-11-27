import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { Group } from "@mantine/core";
import {
  GeometryMenu,
  SelectionNotices,
} from "@editor/tools/pdfTextEditor/components/toolbar/DetailsGroup";
import type { SelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

const noop = () => {};

/** One text box, 120 by 18 points; its height follows its type. */
const ONE_TEXT_BOX: SelectionGeometry = {
  single: {
    bounds: { x: 72, y: 640, width: 120, height: 18 },
    setX: noop,
    setY: noop,
    setWidth: noop,
  },
};

/** A scanned block whose font can be matched by eye. */
function scanMatch(approximate: boolean): ScanFontMatch {
  return {
    canShow: true,
    approximate,
    undrawable: false,
    show: noop,
  } as unknown as ScanFontMatch;
}

/**
 * The selection bar's details: position and size behind one button, then
 * whatever the selection needs the user to know.
 */
function DetailsDemo({
  geometry = ONE_TEXT_BOX,
  note = null,
  scan = null,
}: {
  geometry?: SelectionGeometry;
  note?: string | null;
  scan?: "approximate" | "exact" | null;
}) {
  return (
    <Group gap={4} p="xl" wrap="nowrap">
      <GeometryMenu
        geometry={geometry}
        isImage={false}
        dropdownPosition="bottom"
      />
      <SelectionNotices
        note={note}
        scanFontMatch={scan ? scanMatch(scan === "approximate") : null}
      />
    </Group>
  );
}

const meta: Meta<typeof DetailsDemo> = {
  title: "Text editor/Selection bar details",
  component: DetailsDemo,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Position and size, closed. */
export const Default: Story = {};

/** X, Y and width in points; a text box's height is read only. */
export const PositionAndSize: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("pdf-editor-geometry-menu"),
    );
  },
};

/** Several objects: the button explains it needs a single one. */
export const SeveralObjects: Story = { args: { geometry: { single: null } } };

/** Typing into this text will not come out as expected, said on hover. */
export const FontWarning: Story = {
  args: {
    note: "DejaVu Serif · missing q W - typing those falls back to Helvetica.",
  },
};

/** Scanned text redrawn in a font that may not match the scan. */
export const ScannedApproximate: Story = { args: { scan: "approximate" } };

/** Scanned text: its font can be picked by eye. */
export const ScannedFont: Story = { args: { scan: "exact" } };
