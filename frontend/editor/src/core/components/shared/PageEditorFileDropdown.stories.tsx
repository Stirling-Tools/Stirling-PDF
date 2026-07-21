import type { CSSProperties } from "react";
import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import { PageEditorFileDropdown } from "@app/components/shared/PageEditorFileDropdown";
import { AppProviders } from "@app/components/AppProviders";
import type { FileId } from "@app/types/file";

// PageEditorFileDropdown's "Add File" button reads openFilesModal from
// FilesModalContext, which is only available inside the full provider tree —
// mount that here with the network fetch + blocking gate disabled so the
// story renders immediately.
const withAppProviders: Decorator = (Story) => (
  <AppProviders
    appConfigProviderProps={{
      initialConfig: {},
      bootstrapMode: "non-blocking",
      autoFetch: false,
    }}
  >
    <Story />
  </AppProviders>
);

const noop = () => {};

const files = [
  { fileId: "file-1" as FileId, name: "annual-report.pdf", isSelected: true },
  {
    fileId: "file-2" as FileId,
    name: "appendix.pdf",
    versionNumber: 2,
    isSelected: false,
  },
  { fileId: "file-3" as FileId, name: "cover-letter.pdf", isSelected: true },
];

const fileColorMap = new Map<string, number>([
  ["file-1", 0],
  ["file-2", 1],
  ["file-3", 2],
]);

const viewOptionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 0.75rem",
};

const meta = {
  title: "PageEditor/PageEditorFileDropdown",
  component: PageEditorFileDropdown,
  decorators: [withAppProviders],
} satisfies Meta<typeof PageEditorFileDropdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    files,
    onToggleSelection: noop,
    onReorder: noop,
    viewOptionStyle,
    fileColorMap,
    selectedCount: 2,
    totalCount: files.length,
  },
};

export const Switching: Story = {
  args: {
    ...Default.args,
    switchingTo: "pageEditor",
  },
};

export const Empty: Story = {
  args: {
    ...Default.args,
    files: [],
    fileColorMap: new Map(),
    selectedCount: 0,
    totalCount: 0,
  },
};
