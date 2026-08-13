/**
 * The Annotate tool panel: the select-and-edit button, undo/redo and the
 * overflow action beside it, then the annotation tools grouped by kind, and the
 * save button at the foot.
 *
 * Which tool is active decides the highlighting across those groups, and it is
 * also the only thing that reveals the settings card — that card is rendered
 * for the stamp tool alone, where it carries the image uploader and, once an
 * image is chosen, its preview. The viewer's annotation visibility switch
 * disables every tool at once, undo and redo follow the history the viewer
 * reports, and the save button waits on whether there is anything to apply.
 *
 * The colour picker and the clear-all confirmation are both modals opened from
 * within, so neither is reachable by setting a prop.
 *
 * The panel closes with the suggested-tools strip, which reads the tool
 * workflow and navigation contexts; the shared tool fixture supplies them.
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnnotationPanel } from "@app/tools/annotate/AnnotationPanel";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import type { ViewerContextType } from "@app/contexts/ViewerContext";

/** A one-inch red square, so the stamp preview has something stable to show. */
const STAMP_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Crect width='72' height='72' fill='%23cc0000'/%3E%3C/svg%3E";

const styleState = {
  inkColor: "#0066cc",
  inkWidth: 3,
  highlightColor: "#ffd43b",
  highlightOpacity: 40,
  freehandHighlighterWidth: 10,
  underlineColor: "#0066cc",
  underlineOpacity: 100,
  strikeoutColor: "#cc0000",
  strikeoutOpacity: 100,
  squigglyColor: "#009900",
  squigglyOpacity: 100,
  textColor: "#000000",
  textSize: 14,
  textAlignment: "left" as const,
  textBackgroundColor: "#ffffff",
  noteBackgroundColor: "#fff3bf",
  shapeStrokeColor: "#0066cc",
  shapeFillColor: "#e7f5ff",
  shapeOpacity: 100,
  shapeStrokeOpacity: 100,
  shapeFillOpacity: 100,
  shapeThickness: 2,
};

const styleActions = {
  setInkColor: () => {},
  setInkWidth: () => {},
  setHighlightColor: () => {},
  setHighlightOpacity: () => {},
  setFreehandHighlighterWidth: () => {},
  setUnderlineColor: () => {},
  setUnderlineOpacity: () => {},
  setStrikeoutColor: () => {},
  setStrikeoutOpacity: () => {},
  setSquigglyColor: () => {},
  setSquigglyOpacity: () => {},
  setTextColor: () => {},
  setTextSize: () => {},
  setTextAlignment: () => {},
  setTextBackgroundColor: () => {},
  setNoteBackgroundColor: () => {},
  setShapeStrokeColor: () => {},
  setShapeFillColor: () => {},
  setShapeOpacity: () => {},
  setShapeStrokeOpacity: () => {},
  setShapeFillOpacity: () => {},
  setShapeThickness: () => {},
};

/** Annotations hidden in the viewer, which locks the whole palette. */
const HIDDEN_VIEWER = {
  isAnnotationsVisible: false,
  setAnnotationMode: () => {},
} as unknown as ViewerContextType;

/** The tool panel column. */
const inPanel = (Story: () => ReactElement) => (
  <div style={{ maxWidth: 380 }}>
    <Story />
  </div>
);

const meta = {
  title: "Tools/Annotate/AnnotationPanel",
  component: AnnotationPanel,
  decorators: [inPanel, withToolContexts()],
  args: {
    activeTool: "select",
    activateAnnotationTool: () => {},
    styleState,
    styleActions,
    getActiveColor: () => "#0066cc",
    buildToolOptions: () => ({}),
    deriveToolFromAnnotation: () => undefined,
    selectedAnn: null,
    selectedTextDraft: "",
    setSelectedTextDraft: () => {},
    selectedFontSize: 14,
    setSelectedFontSize: () => {},
    annotationApiRef: { current: null },
    signatureApiRef: { current: null },
    viewerContext: null,
    setPlacementMode: () => {},
    setSignatureConfig: () => {},
    computeStampDisplaySize: () => ({ width: 144, height: 144 }),
    setStampImageData: () => {},
    stampImageSize: null,
    setStampImageSize: () => {},
    setPlacementPreviewSize: () => {},
    undo: () => {},
    redo: () => {},
    historyAvailability: { canUndo: false, canRedo: false },
    onClearDocumentAnnotations: () => true,
    onApplyChanges: () => {},
    applyDisabled: false,
  },
} satisfies Meta<typeof AnnotationPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The resting state: select-and-edit, nothing drawn yet, nothing to undo. */
export const Default: Story = {};

/** A markup tool taken up, which moves the emphasis into its group. */
export const HighlightSelected: Story = {
  args: { activeTool: "highlight" },
};

/** The stamp tool, the one tool that brings its own settings card. */
export const StampSelected: Story = {
  args: { activeTool: "stamp" },
};

/** An image chosen for the stamp, shown back before it is placed. */
export const StampWithImage: Story = {
  args: { activeTool: "stamp", stampImageData: STAMP_IMAGE },
};

/** Annotations hidden in the viewer: every tool is out of reach. */
export const AnnotationsHidden: Story = {
  args: { viewerContext: HIDDEN_VIEWER, activeTool: "ink" },
};

/** Edits behind and ahead, so both history controls are live. */
export const HistoryAvailable: Story = {
  args: { historyAvailability: { canUndo: true, canRedo: true } },
};

/** Nothing changed since the last save, so there is nothing to apply. */
export const NothingToSave: Story = {
  args: { applyDisabled: true },
};
