import type { Meta, StoryObj } from "@storybook/react-vite";
import FileListItem from "@app/components/fileManager/FileListItem";
import { AppProviders } from "@app/components/AppProviders";
import { FileManagerProvider } from "@app/contexts/FileManagerContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { ToolId } from "@app/types/toolId";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 245_000,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const meta = {
  title: "FileManager/FileListItem",
  component: FileListItem,
  // FileListItem reads useAppConfig() and useFileManagerContext() (and, via
  // FileManagerProvider, useFileManagement() from FileContext), so it needs the
  // same provider stack the real file manager modal mounts it inside.
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <FileManagerProvider
          recentFiles={[]}
          onRecentFilesSelected={() => {}}
          onNewFilesSelect={() => {}}
          onClose={() => {}}
          isFileSupported={() => true}
          isOpen
          onFileRemove={() => {}}
          modalHeight="600px"
          refreshRecentFiles={async () => {}}
          isLoading={false}
          activeFileIds={[]}
        >
          <Story />
        </FileManagerProvider>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof FileListItem>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: buildFileStub(),
    isSelected: false,
    onSelect: () => {},
    onRemove: () => {},
    onDownload: () => {},
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    isSelected: true,
  },
};

export const WithHistory: Story = {
  args: {
    ...Default.args,
    file: buildFileStub({
      name: "report-final.pdf",
      versionNumber: 2,
      toolHistory: [{ toolId: "compress-pdf" as ToolId, timestamp: 0 }],
    }),
    isLatestVersion: true,
  },
};
