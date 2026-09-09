import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import BulkShareModal from "@app/components/shared/BulkShareModal";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFiles: StirlingFileStub[] = [
  {
    id: "story-file-1" as FileId,
    name: "quarterly-report.pdf",
    type: "application/pdf",
    size: 2_400_000,
    lastModified: Date.now(),
    isLeaf: true,
    originalFileId: "story-file-1",
    versionNumber: 1,
  },
  {
    id: "story-file-2" as FileId,
    name: "cover-letter.pdf",
    type: "application/pdf",
    size: 180_000,
    lastModified: Date.now(),
    isLeaf: true,
    originalFileId: "story-file-2",
    versionNumber: 1,
  },
];

/**
 * BulkShareModal reads useFileActions() from FileContext, which isn't part of
 * the shared preview decorators, so it's provided here for every story.
 * AppConfig (gating share links on `storageShareLinksEnabled`) is added
 * per-story instead, since Default and LinksEnabled need different values.
 */
function withFileContext(Story: () => ReactElement) {
  return (
    <FileContextProvider>
      <Story />
    </FileContextProvider>
  );
}

const meta = {
  title: "Shared/BulkShareModal",
  component: BulkShareModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    files: mockFiles,
  },
  decorators: [withFileContext],
} satisfies Meta<typeof BulkShareModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Share links disabled by server config — default when no config is loaded. */
export const Default: Story = {};

/** Share links enabled — the role selector and "Generate Link" action are active. */
export const LinksEnabled: Story = {
  decorators: [
    (Story) => (
      <AppConfigProvider
        initialConfig={{ storageShareLinksEnabled: true }}
        autoFetch={false}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
};
