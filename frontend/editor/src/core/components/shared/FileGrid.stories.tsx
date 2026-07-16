import type { Meta, StoryObj } from "@storybook/react-vite";
import FileGrid from "@app/components/shared/FileGrid";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * FileGrid renders FileCard entries, which call useFileThumbnail ->
 * useIndexedDBThumbnail. That hook reads IndexedDBContext + FileContext,
 * neither of which is part of the shared preview decorators, so
 * FileContextProvider (which wraps IndexedDBProvider internally) is stood up
 * here.
 */
function withFileContext(Story: () => JSX.Element) {
  return (
    <FileContextProvider>
      <Story />
    </FileContextProvider>
  );
}

const buildFile = (name: string, size: number, type: string): File => {
  return new File([new Uint8Array(size)], name, {
    type,
    lastModified: Date.now(),
  });
};

const buildRecord = (
  id: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: id as FileId,
  name: overrides.name ?? "report.pdf",
  type: overrides.type ?? "application/pdf",
  size: overrides.size ?? 1_240_000,
  lastModified: overrides.lastModified ?? Date.now(),
  isLeaf: true,
  originalFileId: id,
  versionNumber: 1,
  // Set so useLazyThumbnail short-circuits on the stored thumbnail instead of
  // trying to read file bytes out of IndexedDB.
  thumbnailUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='160'%3E%3Crect width='120' height='160' fill='%23e9ecef'/%3E%3C/svg%3E",
  ...overrides,
});

const files = [
  {
    file: buildFile("report.pdf", 1_240_000, "application/pdf"),
    record: buildRecord("file-1", { name: "report.pdf" }),
  },
  {
    file: buildFile("invoice.pdf", 540_000, "application/pdf"),
    record: buildRecord("file-2", {
      name: "invoice.pdf",
      size: 540_000,
    }),
  },
  {
    file: buildFile(
      "budget.xlsx",
      82_000,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    record: buildRecord("file-3", {
      name: "budget.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 82_000,
      thumbnailUrl: undefined,
    }),
  },
];

const meta = {
  title: "Shared/FileGrid",
  component: FileGrid,
  decorators: [withFileContext],
  args: {
    files,
    onRemove: () => {},
  },
} satisfies Meta<typeof FileGrid>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SearchAndSort: Story = {
  args: {
    showSearch: true,
    showSort: true,
    onDeleteAll: () => {},
  },
};

export const Empty: Story = {
  args: {
    files: [],
    showSearch: true,
  },
};
