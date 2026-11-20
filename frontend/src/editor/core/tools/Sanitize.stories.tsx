import type { StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  toggle,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Sanitize/Panel",
  ...toolPanelMeta("sanitize"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const OPTIONS = [
  /^Remove JavaScript/,
  /^Remove Embedded Files/,
  /^Remove XMP Metadata/,
  /^Remove Document Metadata/,
  /^Remove Links/,
  /^Remove Fonts/,
];

const CHECKED_BY_DEFAULT = OPTIONS.slice(0, 2);

async function clearSelection(context: PlayContext) {
  for (const name of CHECKED_BY_DEFAULT)
    await toggle(context, "checkbox", name);
}

export const Panel: Story = {};

export const EverythingSelected: Story = {
  play: async (context) => {
    for (const name of OPTIONS.slice(2))
      await toggle(context, "checkbox", name);
    const panel = await panelOf(context);
    for (const name of OPTIONS)
      await expect(panel.getByRole("checkbox", { name })).toBeChecked();
  },
};

export const NothingSelected: Story = {
  play: clearSelection,
};

export const NothingSelectedTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: clearSelection }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/sanitize-pdf", "sample.pdf"),
  ),
  play: runToResults,
};
