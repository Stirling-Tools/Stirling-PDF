import type { Meta, StoryObj } from "@storybook/react-vite";
import ShareManagementModal from "@app/components/shared/ShareManagementModal";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFile: StirlingFileStub = {
  id: "story-file-1" as FileId,
  name: "quarterly-report.pdf",
  type: "application/pdf",
  size: 2_400_000,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "story-file-1",
  versionNumber: 1,
};

/**
 * ShareManagementModal reads useFileActions() from FileContext (stood up here
 * since it isn't part of the shared preview decorators) and useAppConfig() to
 * gate share links on `storageShareLinksEnabled` — wrapped per-story to show
 * both the disabled and enabled states.
 */
function withFileContext(Story: () => JSX.Element) {
  return (
    <FileContextProvider>
      <Story />
    </FileContextProvider>
  );
}

const meta = {
  title: "Shared/ShareManagementModal",
  component: ShareManagementModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    file: mockFile,
  },
  decorators: [withFileContext],
} satisfies Meta<typeof ShareManagementModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Share links disabled by server config — default when no config is loaded. */
export const Default: Story = {};

/** Share links enabled — the role selector, link generation and activity panel are active. */
export const LinksEnabled: Story = {
  decorators: [
    (Story) => (
      <AppConfigProvider
        initialConfig={{
          storageSharingEnabled: true,
          storageShareLinksEnabled: true,
        }}
        autoFetch={false}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
};
