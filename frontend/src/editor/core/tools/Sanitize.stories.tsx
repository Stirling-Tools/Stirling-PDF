import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Sanitize/Panel",
  ...toolPanelMeta("sanitize"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const nothingSelected = {
  parameters: { removeJavaScript: false, removeEmbeddedFiles: false },
} as const;

export const Panel: Story = {};

export const NothingSelected: Story = {
  args: nothingSelected,
};

export const RemoveJavaScriptTooltip: Story = {
  play: openTooltip({
    info: "Remove JavaScript actions and scripts from the PDF",
  }),
};

export const RemoveEmbeddedFilesTooltip: Story = {
  play: openTooltip({ info: "Remove any files embedded within the PDF" }),
};

export const RemoveXmpMetadataTooltip: Story = {
  play: openTooltip({ info: "Remove XMP metadata from the PDF" }),
};

export const RemoveDocumentMetadataTooltip: Story = {
  play: openTooltip({
    info: "Remove document information metadata (title, author, etc.)",
  }),
};

export const RemoveLinksTooltip: Story = {
  play: openTooltip({
    info: "Remove external links and launch actions from the PDF",
  }),
};

export const RemoveFontsTooltip: Story = {
  play: openTooltip({ info: "Remove embedded fonts from the PDF" }),
};

export const NothingSelectedTooltip: Story = {
  args: nothingSelected,
  play: openTooltip({ runButton: true }),
};
