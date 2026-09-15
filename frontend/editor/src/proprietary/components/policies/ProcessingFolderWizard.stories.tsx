import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcessingFolderWizard } from "@app/components/policies/ProcessingFolderWizard";
import { createFolderId, type FolderRecord } from "@app/types/folder";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";

import { assemblePolicies } from "@app/policies/overview";

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
    folders: [
      invoices,
      archive,
      {
        ...invoices,
        id: createFolderId(),
        name: "2026",
        parentFolderId: invoices.id,
      },
    ],
    catalogue: assemblePolicies([], []).catalogue,
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
export const Desktop: Story = {
  args: {
    canPickDirectory: true,
    folders: [
      invoices,
      archive,
      {
        ...invoices,
        id: createFolderId(),
        name: "Documents",
        kind: "local",
        directory: "C:/Documents",
      },
    ],
  },
};
export const ManyFolders: Story = {
  args: {
    folders: Array.from({ length: 80 }, (_, i) => ({
      ...invoices,
      id: createFolderId(),
      name: `Folder ${String(i + 1).padStart(2, "0")}`,
    })),
  },
};
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

export const ConfiguredPoliciesFirst: Story = {
  args: {
    initialFolder: invoices,
    catalogue: assemblePolicies(
      [
        {
          id: "saved-compliance",
          name: "Compliance",
          enabled: true,
          inputs: [],
          output: { type: "inline", options: { categoryId: "compliance" } },
          steps: [
            {
              operation: "/api/v1/security/sanitize-pdf",
              parameters: { removeJavaScript: false, removeMetadata: true },
            },
          ],
        },
      ],
      [],
    ).catalogue,
  },
};

export const Routing: Story = {
  args: {
    initialFolder: invoices,
    destinations: [
      { id: "finance", name: "Finance" },
      { id: "archive", name: "Archive" },
    ],
    catalogue: assemblePolicies(
      [
        {
          id: "routing-preset",
          name: "Routing",
          enabled: true,
          inputs: [],
          output: { type: "inline", options: { categoryId: "routing" } },
          steps: [
            {
              operation: "/api/v1/ai/tools/classify-and-label",
              parameters: {},
            },
          ],
          outputIds: ["archive"],
          routingRules: [
            {
              condition: {
                input: { source: "document", field: "classification.labels" },
                operator: "matches-any",
                values: ["invoice"],
              },
              outputId: "finance",
            },
          ],
        },
      ],
      [],
    ).catalogue,
  },
};
