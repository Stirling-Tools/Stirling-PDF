import type { StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import {
  appConfig,
  onViewer,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  armPlacement,
  findEnabled,
  openTooltip,
  type PanelQueries,
  placeAndUndo,
  placeOnPage,
  type PlayContext,
  STAGE_TIMEOUT,
  toggle,
  untilPanelShows,
  uploadToPanel,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add image/Panel",
  ...toolPanelMeta("addImage"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const REMOVE_BACKGROUND = "Remove white background (make transparent)";

async function uploadImage(context: PlayContext): Promise<PanelQueries> {
  await waitForPanelText(context, "Select image file");
  const panel = await uploadToPanel(context, "sample.png");
  await panel.findByRole(
    "img",
    { name: "Current image signature" },
    STAGE_TIMEOUT,
  );
  await waitFor(
    () =>
      expect(
        panel.getByRole("checkbox", { name: REMOVE_BACKGROUND }),
      ).toBeEnabled(),
    STAGE_TIMEOUT,
  );
  return panel;
}

async function armImagePlacement(context: PlayContext): Promise<PanelQueries> {
  await uploadImage(context);
  return armPlacement(context);
}

function placeImage(context: PlayContext): Promise<PanelQueries> {
  return placeOnPage(context, armImagePlacement);
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const ImageUploaded: Story = {
  play: async (context) => {
    await uploadImage(context);
    await waitForPanelText(context, "Placement paused");
  },
};

export const WhiteBackgroundRemoved: Story = {
  play: async (context) => {
    await uploadImage(context);
    await toggle(context, "checkbox", REMOVE_BACKGROUND);
    await findEnabled(context, "checkbox", REMOVE_BACKGROUND);
  },
};

export const MobileUpload: Story = {
  parameters: toolPanelServer(appConfig({ enableMobileSignature: true })),
  play: untilPanelShows("Mobile upload"),
};

export const PlacementActive: Story = {
  ...onViewer(),
  play: async (context) => {
    await armImagePlacement(context);
    await waitForPanelText(context, "How to add images");
  },
};

export const ImagePlaced: Story = {
  ...onViewer(),
  play: placeImage,
};

export const UndoTooltip: Story = {
  ...onViewer(),
  play: openTooltip({ info: "Undo" }, { after: placeImage }),
};

export const RedoTooltip: Story = {
  ...onViewer(),
  play: openTooltip(
    { info: "Redo" },
    { after: (context) => placeAndUndo(context, armImagePlacement) },
  ),
};
