import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  appConfig,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findPageElement,
  openTooltip,
  type PanelQueries,
  placeOnPage,
  type PlayContext,
  STAGE_TIMEOUT,
  undoInPanel,
  untilPanelShows,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Add image/Panel",
  ...toolPanelMeta("addImage"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

async function uploadImage(context: PlayContext): Promise<void> {
  const panelElement = await waitForToolPanel(context);
  const panel = within(panelElement);
  const picker = await panel.findByRole("button", {
    name: "Select image file",
  });
  await waitFor(() => expect(picker).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.upload(
    panelElement.querySelector<HTMLInputElement>('input[type="file"]')!,
    await loadFixture("sample.png"),
  );
  await panel.findByRole("img", { name: "Current image signature" });
  await waitFor(() =>
    expect(
      panel.getByRole("checkbox", {
        name: "Remove white background (make transparent)",
      }),
    ).toBeEnabled(),
  );
}

export const ImageUploaded: Story = {
  play: uploadImage,
};

export const MobileUpload: Story = {
  parameters: toolPanelServer(appConfig({ enableMobileSignature: true })),
  play: untilPanelShows("Mobile upload"),
};

export const ConfigureImageTooltip: Story = {
  play: openTooltip({ step: "Configure Image" }),
};

export const PlaceImageTooltip: Story = {
  play: openTooltip({ info: "Click on the PDF to add your image" }),
};

export const ResumePlacementTooltip: Story = {
  play: openTooltip({ info: "Resume placement" }, { after: uploadImage }),
};

const onViewer = { showWorkbench: true, workbench: "viewer" } as const;

async function armImagePlacement(context: PlayContext): Promise<PanelQueries> {
  await findPageElement(context);
  await uploadImage(context);
  const panel = within(await waitForToolPanel(context));
  await panel.findByRole("button", { name: "Pause placement" }, STAGE_TIMEOUT);
  return panel;
}

function placeImage(context: PlayContext): Promise<PanelQueries> {
  return placeOnPage(context, armImagePlacement);
}

async function placeAndUndo(context: PlayContext): Promise<void> {
  await undoInPanel(await placeImage(context));
}

export const PausePlacementTooltip: Story = {
  args: onViewer,
  play: openTooltip({ info: "Pause placement" }, { after: armImagePlacement }),
};

export const UndoTooltip: Story = {
  args: onViewer,
  play: openTooltip({ info: "Undo" }, { after: placeImage }),
};

export const RedoTooltip: Story = {
  args: onViewer,
  play: openTooltip({ info: "Redo" }, { after: placeAndUndo }),
};
