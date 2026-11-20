import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  knownA11yIssues,
  onViewer,
  toolPanelMeta,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  clickPage,
  dragOnPage,
  findPageElement,
  openMenu,
  openTooltip,
  type PlayContext,
  STAGE_TIMEOUT,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Annotate/Panel",
  ...toolPanelMeta("annotate"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function chooseAddImage(context: PlayContext) {
  const panel = await waitForPanelText(context, "Notes & Stamps");
  await userEvent.click(panel.getByRole("button", { name: "Add Image" }));
  await panel.findByText("Stamp Settings", undefined, STAGE_TIMEOUT);
  return panel;
}

export const Panel: Story = {};

export const AddImageStamp: Story = {
  play: chooseAddImage,
};

export const AddImageStampUploaded: Story = {
  play: async (context) => {
    const panel = await chooseAddImage(context);
    const input =
      context.canvasElement.ownerDocument.querySelector<HTMLInputElement>(
        '[data-sidebar="tool-panel"] input[type="file"]',
      );
    expect(input).not.toBeNull();
    await userEvent.upload(input!, await loadFixture("sample.png"));
    await panel.findByAltText("Stamp preview", undefined, STAGE_TIMEOUT);
  },
};

export const MoreActionsMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    await openMenu(context, "More actions");
  },
};

export const ClearAllAnnotationsDialog: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    const menu = await openMenu(context, "More actions");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Clear all annotations" }),
    );
    await bodyOf(context).findByRole(
      "dialog",
      { name: "Clear all annotations?" },
      STAGE_TIMEOUT,
    );
  },
};

export const SelectAndEditTooltip: Story = {
  play: openTooltip({ info: "Select and Edit" }),
};

export const UndoTooltip: Story = {
  play: openTooltip({ info: "Undo" }),
};

export const RedoTooltip: Story = {
  play: openTooltip({ info: "Redo" }),
};

export const MoreActionsTooltip: Story = {
  play: openTooltip({ info: "More actions" }),
};

export const HighlightTooltip: Story = {
  play: openTooltip({ info: "Highlight" }),
};

export const UnderlineTooltip: Story = {
  play: openTooltip({ info: "Underline" }),
};

export const StrikeoutTooltip: Story = {
  play: openTooltip({ info: "Strikeout" }),
};

export const SquigglyTooltip: Story = {
  play: openTooltip({ info: "Squiggly" }),
};

export const PenTooltip: Story = {
  play: openTooltip({ info: "Pen" }),
};

export const FreehandHighlighterTooltip: Story = {
  play: openTooltip({ info: "Freehand Highlighter" }),
};

export const SquareTooltip: Story = {
  play: openTooltip({ info: "Square" }),
};

export const CircleTooltip: Story = {
  play: openTooltip({ info: "Circle" }),
};

export const LineTooltip: Story = {
  play: openTooltip({ info: "Line" }),
};

export const ArrowTooltip: Story = {
  play: openTooltip({ info: "Arrow" }),
};

export const PolylineTooltip: Story = {
  play: openTooltip({ info: "Polyline" }),
};

export const PolygonTooltip: Story = {
  play: openTooltip({ info: "Polygon" }),
};

export const CommentTooltip: Story = {
  play: openTooltip({ info: "Comment" }),
};

export const InsertTextTooltip: Story = {
  play: openTooltip({ info: "Insert Text" }),
};

export const ReplaceTextTooltip: Story = {
  play: openTooltip({ info: "Replace Text" }),
};

export const TextBoxTooltip: Story = {
  play: openTooltip({ info: "Text box" }),
};

export const NoteTooltip: Story = {
  play: openTooltip({ info: "Note" }),
};

export const AddImageTooltip: Story = {
  play: openTooltip({ info: "Add Image" }),
};

async function pickTool(context: PlayContext, tool: string) {
  const panel = await waitForPanelText(context, "Shapes");
  const button = panel.getByRole("button", { name: tool });
  await waitFor(() => expect(button).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(button);
  return panel;
}

export const MultiClickShapeHint: Story = {
  ...onViewer(),
  play: async (context) => {
    await pickTool(context, "Polyline");
    await clickPage(context, { x: 0.5, y: 0.5 });
    await within(await findPageElement(context)).findByText(
      "Double-click or press Enter to finish",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const SaveChangesEnabled: Story = {
  ...onViewer(),
  play: async (context) => {
    const panel = await pickTool(context, "Square");
    await dragOnPage(context, { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
    const save = panel.getByRole("button", { name: "Save Changes" });
    await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
  },
};

export const AnnotationsHidden: Story = {
  ...onViewer(),
  play: async (context) => {
    const panel = await waitForPanelText(context, "Shapes");
    const toggle = await within(context.canvasElement).findByRole(
      "button",
      { name: "Toggle Annotations Visibility" },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(toggle).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(panel.getByRole("button", { name: "Square" })).toBeDisabled(),
    );
  },
};
