import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  appConfig,
  knownA11yIssues,
  onViewer,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  armPlacement,
  bodyOf,
  findEnabled,
  openSelect,
  openTooltip,
  panelOf,
  type PanelQueries,
  placeAndUndo,
  placeOnPage,
  type PlayContext,
  STAGE_TIMEOUT,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Text/Panel",
  ...toolPanelMeta("addText"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function typeText(context: PlayContext): Promise<void> {
  await userEvent.type(
    await findEnabled(context, "textbox", "Text content"),
    "Approved by J. Doe",
  );
}

async function enterText(context: PlayContext): Promise<PanelQueries> {
  await typeText(context);
  return waitForPanelText(context, "Placement paused");
}

async function armTextPlacement(context: PlayContext): Promise<PanelQueries> {
  await typeText(context);
  return armPlacement(context);
}

function placeText(context: PlayContext): Promise<PanelQueries> {
  return placeOnPage(context, armTextPlacement);
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const TextEntered: Story = {
  play: enterText,
};

export const FontMenu: Story = {
  play: async (context) => {
    const options = await openSelect(context, "Font");
    await expect(options.getAllByRole("option")).toHaveLength(5);
  },
};

export const FontSizeMenu: Story = {
  // The font size Combobox's listbox has no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    await userEvent.click(await findEnabled(context, "textbox", "Font size"));
    const panel = await panelOf(context);
    await expect(
      await panel.findByRole("option", { name: "200px" }, STAGE_TIMEOUT),
    ).toBeInTheDocument();
  },
};

export const TextColorPicker: Story = {
  play: async (context) => {
    const colour = await findEnabled(context, "textbox", "Text color");
    // The swatch that opens the picker is a plain div with no role or name.
    const swatch = colour
      .closest(".mantine-TextInput-root")
      ?.querySelector<HTMLElement>(".mantine-TextInput-section > div");
    await expect(swatch).toBeTruthy();
    await userEvent.click(swatch!);
    await bodyOf(context).findByRole(
      "dialog",
      { name: "Choose color" },
      STAGE_TIMEOUT,
    );
  },
};

export const MobileUpload: Story = {
  parameters: toolPanelServer(appConfig({ enableMobileSignature: true })),
  play: untilPanelShows("Mobile upload"),
};

export const PlacementActive: Story = {
  ...onViewer(),
  play: async (context) => {
    await armTextPlacement(context);
    await waitForPanelText(context, "How to add text");
  },
};

export const TextPlaced: Story = {
  ...onViewer(),
  play: placeText,
};

export const UndoTooltip: Story = {
  ...onViewer(),
  play: openTooltip({ info: "Undo" }, { after: placeText }),
};

export const RedoTooltip: Story = {
  ...onViewer(),
  play: openTooltip(
    { info: "Redo" },
    { after: (context) => placeAndUndo(context, armTextPlacement) },
  ),
};
