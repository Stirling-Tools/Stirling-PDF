import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcessingFolderWizard } from "@app/components/policies/ProcessingFolderWizard";
import { createFolderId, type FolderRecord } from "@app/types/folder";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";

const invoices: FolderRecord = {
  id: createFolderId(),
  name: "Invoices",
  parentFolderId: null,
  kind: "server",
  createdAt: 0,
  updatedAt: 0,
};
const archive: FolderRecord = {
  ...invoices,
  id: createFolderId(),
  name: "Archive",
};

const meta = {
  title: "Files/ProcessingFolderWizard",
  component: ProcessingFolderWizard,
  parameters: { layout: "fullscreen" },
  args: {
    folders: [invoices, archive],
    aiEngineEnabled: true,
    canPickDirectory: false,
    serverDisabledReason: null,
    serverLabel: "Server storage",
    pickDirectory: async () => ({
      path: "C:/Documents/Invoices",
      name: "Invoices",
    }),
    recordFor: (): ProcessingRecordSummary | undefined => undefined,
    resolveTarget: async () => invoices,
    save: async () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ProcessingFolderWizard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const ExistingFolder: Story = { args: { initialFolder: invoices } };
export const Desktop: Story = { args: { canPickDirectory: true } };
export const StorageUnavailable: Story = {
  args: { serverDisabledReason: "Sign in to use server storage." },
};
export const Paused: Story = {
  args: {
    initialFolder: invoices,
    recordFor: () => ({
      id: "processing-1",
      enabled: false,
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
    }),
  },
};
