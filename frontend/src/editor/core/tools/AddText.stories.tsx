import type { StoryObj } from "@storybook/react-vite";
import {
  appConfig,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  armPlacement,
  openTooltip,
  type PanelQueries,
  placeOnPage,
  type PlayContext,
  undoInPanel,
  untilPanelShows,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Text/Panel",
  ...toolPanelMeta("addText"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

const textEntered = { parameters: { signerName: "Approved by J. Doe" } };
const textOnViewer = {
  ...textEntered,
  showWorkbench: true,
  workbench: "viewer",
} as const;

export const TextEntered: Story = {
  args: textEntered,
};

export const MobileUpload: Story = {
  parameters: toolPanelServer(appConfig({ enableMobileSignature: true })),
  play: untilPanelShows("Mobile upload"),
};

export const ConfigureTextTooltip: Story = {
  play: openTooltip({ step: "Configure Text" }),
};

export const PlaceTextTooltip: Story = {
  play: openTooltip({ info: "Click on the PDF to add your text" }),
};

export const ResumePlacementTooltip: Story = {
  args: textEntered,
  play: openTooltip({ info: "Resume placement" }),
};

function placeText(context: PlayContext): Promise<PanelQueries> {
  return placeOnPage(context, armPlacement);
}

async function placeAndUndo(context: PlayContext): Promise<void> {
  await undoInPanel(await placeText(context));
}

export const PausePlacementTooltip: Story = {
  args: textOnViewer,
  play: openTooltip({ info: "Pause placement" }, { after: armPlacement }),
};

export const UndoTooltip: Story = {
  args: textOnViewer,
  play: openTooltip({ info: "Undo" }, { after: placeText }),
};

export const RedoTooltip: Story = {
  args: textOnViewer,
  play: openTooltip({ info: "Redo" }, { after: placeAndUndo }),
};
