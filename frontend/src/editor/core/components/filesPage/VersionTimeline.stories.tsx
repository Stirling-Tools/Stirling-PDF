import type { Meta, StoryObj } from "@storybook/react-vite";
import { VersionTimeline } from "@app/components/filesPage/VersionTimeline";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId, ToolOperation } from "@app/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const toolOp = (toolId: ToolOperation["toolId"]): ToolOperation => ({
  toolId,
  timestamp: 0,
});

const shortChain: StirlingFileStub[] = [
  buildFileStub({
    id: "file-1" as FileId,
    name: "report.pdf",
    size: 204800,
    versionNumber: 1,
  }),
  buildFileStub({
    id: "file-2" as FileId,
    name: "report-compressed.pdf",
    size: 102400,
    versionNumber: 2,
    parentFileId: "file-1" as FileId,
    toolHistory: [toolOp("compress")],
  }),
  buildFileStub({
    id: "file-3" as FileId,
    name: "report-watermarked.pdf",
    size: 110592,
    versionNumber: 3,
    parentFileId: "file-2" as FileId,
    toolHistory: [toolOp("compress"), toolOp("watermark")],
  }),
];

const longChain: StirlingFileStub[] = Array.from({ length: 9 }, (_, index) => {
  const versionNumber = index + 1;
  const toolHistory: ToolOperation[] =
    versionNumber === 1
      ? []
      : [toolOp(versionNumber % 2 === 0 ? "compress" : "watermark")];
  return buildFileStub({
    id: `file-${versionNumber}` as FileId,
    name: `report-v${versionNumber}.pdf`,
    size: 100000 + versionNumber * 1024,
    versionNumber,
    parentFileId:
      versionNumber > 1 ? (`file-${versionNumber - 1}` as FileId) : undefined,
    toolHistory,
  });
});

const meta = {
  title: "FilesPage/VersionTimeline",
  component: VersionTimeline,
  args: {
    onAddToWorkspace: () => {},
    onRemove: () => {},
  },
} satisfies Meta<typeof VersionTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    chain: shortChain,
    currentId: "file-3" as FileId,
  },
};

export const NoHeader: Story = {
  args: {
    chain: shortChain,
    currentId: "file-3" as FileId,
    hideHeader: true,
  },
};

export const LongChainCollapsed: Story = {
  args: {
    chain: longChain,
    currentId: "file-9" as FileId,
  },
};
