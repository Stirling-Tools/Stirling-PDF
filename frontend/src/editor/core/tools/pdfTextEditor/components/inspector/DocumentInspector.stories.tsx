import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { Box } from "@mantine/core";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import { storyStore } from "@editor/tools/pdfTextEditor/components/editorStorySupport";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

/** Text colours a document might use, most to least common. */
const PALETTE = [
  "#111827",
  "#b91c1c",
  "#1d4ed8",
  "#15803d",
  "#7e22ce",
  "#ea580c",
  "#0f766e",
  "#db2777",
  "#ca8a04",
  "#4b5563",
  "#0891b2",
  "#9333ea",
  "#be123c",
  "#65a30d",
  "#c2410c",
  "#1e40af",
  "#a16207",
  "#334155",
  "#86198f",
  "#047857",
];

/**
 * A page's worth of runs: standard, embedded and subset fonts, bold faces
 * among them, filled in `colours` colours, the first `locked` of them locked.
 */
function storyPages(colours: number, locked: number): PageSnapshot[] {
  const fonts = [
    { fontId: "base14:Helvetica", subset: false },
    { fontId: "base14:Helvetica-Bold", subset: false },
    { fontId: "base14:Times-Roman", subset: false },
    { fontId: "pdf:1:DejaVuSans", subset: false },
    { fontId: "pdf:2:DejaVuSans-Bold", subset: false },
    { fontId: "pdf:3:ABCDEF+Caladea", subset: true },
    { fontId: "pdf:4:GHIJKL+Carlito-Bold", subset: true },
  ];
  const runs = Array.from({ length: 28 }, (_, i) => {
    const font = fonts[i % fonts.length];
    const hex = PALETTE[i % Math.max(1, colours)];
    return {
      id: `r${i}`,
      pageIndex: 0,
      text: `Line ${i + 1}`,
      fontId: font.fontId,
      fontSubset: font.subset,
      fontSize: 12,
      fill: {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
        a: 1,
      },
      locked: i < locked,
    };
  });
  return [
    {
      pageIndex: 0,
      width: 595,
      height: 842,
      dirty: false,
      revision: 0,
      runs,
      images: [],
      shapes: [],
    } as unknown as PageSnapshot,
  ];
}

/**
 * The text editor panel's document section: its fonts, text colours and
 * locked items, each changed across the whole document, then the view and
 * advanced settings.
 */
function DocumentPanelDemo({
  colours = 6,
  locked = 0,
}: {
  colours?: number;
  locked?: number;
}) {
  const store = useMemo(() => storyStore(), []);
  const pages = useMemo(() => storyPages(colours, locked), [colours, locked]);
  return (
    <Box
      w={296}
      style={{
        border: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-raised)",
      }}
    >
      <DocumentInspector
        store={store}
        pages={pages}
        groupingMode="auto"
        widthMode="grow"
        showRulers={false}
        onChangeFontEverywhere={async () => null}
        onSetGroupingMode={() => {}}
        onSetWidthMode={() => {}}
        onSetShowRulers={() => {}}
      />
    </Box>
  );
}

const meta: Meta<typeof DocumentPanelDemo> = {
  title: "Text editor/Document panel",
  component: DocumentPanelDemo,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Fonts fold behind one row; colours sit on one row of swatches. */
export const Default: Story = {};

/** Each font with its status tag, how often it is used, and a Replace. */
export const FontsOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("pdf-editor-fonts-toggle"),
    );
  },
};

/** Past six colours the rest go behind a "+N" chip, keeping one row. */
export const ManyColours: Story = { args: { colours: 20 } };

/** A count of locked items, and a way to unlock them all. */
export const LockedItems: Story = { args: { locked: 3 } };

/** Change all fonts: the pick previews on the page; Done keeps it. */
export const ChangeFont: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("pdf-editor-all-fonts"),
    );
  },
};

/** Change all colours, previewed on the page the same way. */
export const ChangeColour: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("pdf-editor-all-colours"),
    );
  },
};
