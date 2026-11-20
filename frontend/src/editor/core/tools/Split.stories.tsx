import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import {
  SPLIT_METHODS,
  type SplitMethod,
} from "@editor/constants/splitConstants";

const meta = {
  title: "Tools/Split/Panel",
  ...toolPanelMeta("split", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const method = (value: SplitMethod, extra?: Record<string, unknown>) => ({
  args: { parameters: { method: value, ...extra } },
});

export const Panel: Story = {};

export const ByPageNumbers: Story = method(SPLIT_METHODS.BY_PAGES);

export const BySections: Story = method(SPLIT_METHODS.BY_SECTIONS);

export const BySectionsCustomPages: Story = method(SPLIT_METHODS.BY_SECTIONS, {
  splitMode: "CUSTOM",
});

export const ByFileSize: Story = method(SPLIT_METHODS.BY_SIZE);

export const ByPageCount: Story = method(SPLIT_METHODS.BY_PAGE_COUNT);

export const ByDocumentCount: Story = method(SPLIT_METHODS.BY_DOC_COUNT);

export const ByChapters: Story = method(SPLIT_METHODS.BY_CHAPTERS);

export const ByPageDivider: Story = method(SPLIT_METHODS.BY_PAGE_DIVIDER);

export const ByPrintableChunks: Story = method(SPLIT_METHODS.BY_POSTER);

export const ChooseMethodTooltip: Story = {
  play: openTooltip({ step: "Choose Method" }),
};

export const PageNumbersMethodTooltip: Story = {
  play: openTooltip({ text: "Page Numbers" }),
};

export const ChaptersMethodTooltip: Story = {
  play: openTooltip({ text: "Chapters" }),
};

export const SectionsMethodTooltip: Story = {
  play: openTooltip({ text: "Sections" }),
};

export const FileSizeMethodTooltip: Story = {
  play: openTooltip({ text: "File Size" }),
};

export const PageCountMethodTooltip: Story = {
  play: openTooltip({ text: "Page Count" }),
};

export const DocumentCountMethodTooltip: Story = {
  play: openTooltip({ text: "Document Count" }),
};

export const PageDividerMethodTooltip: Story = {
  play: openTooltip({ text: "Page Divider" }),
};

export const PrintableChunksMethodTooltip: Story = {
  play: openTooltip({ text: "Printable Chunks" }),
};

export const ByPageNumbersTooltip: Story = {
  ...ByPageNumbers,
  play: openTooltip({ step: "Split at Page Numbers" }),
};

export const BySectionsTooltip: Story = {
  ...BySections,
  play: openTooltip({ step: "Split by Sections" }),
};

export const ByFileSizeTooltip: Story = {
  ...ByFileSize,
  play: openTooltip({ step: "Split by File Size" }),
};

export const ByPageCountTooltip: Story = {
  ...ByPageCount,
  play: openTooltip({ step: "Split by Page Count" }),
};

export const ByDocumentCountTooltip: Story = {
  ...ByDocumentCount,
  play: openTooltip({ step: "Split by Document Count" }),
};

export const ByChaptersTooltip: Story = {
  ...ByChapters,
  play: openTooltip({ step: "Split by Chapters" }),
};

export const ByPageDividerTooltip: Story = {
  ...ByPageDivider,
  play: openTooltip({ step: "Split by Page Divider" }),
};

export const ByPrintableChunksTooltip: Story = {
  ...ByPrintableChunks,
  play: openTooltip({ step: "Split into Printable Chunks" }),
};

export const SettingsRequiredTooltip: Story = {
  ...ByPageNumbers,
  play: openTooltip({ runButton: true }),
};
