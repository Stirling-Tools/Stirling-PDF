import type { Meta, StoryObj } from "@storybook/react-vite";
import FilePickerModal from "@app/components/shared/FilePickerModal";

const mockStoredFiles = [
  { id: "file-1", name: "invoice.pdf", size: 245_000, thumbnail: null },
  {
    id: "file-2",
    name: "contract-draft.pdf",
    size: 1_240_000,
    thumbnail: null,
  },
  { id: "file-3", name: "scanned-form.pdf", size: 3_400_000, thumbnail: null },
];

const meta = {
  title: "Shared/FilePickerModal",
  component: FilePickerModal,
  parameters: { layout: "padded" },
  args: {
    opened: true,
    onClose: () => {},
    onSelectFiles: () => {},
    storedFiles: mockStoredFiles,
  },
} satisfies Meta<typeof FilePickerModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Storage populated with a few files available to pick from. */
export const Default: Story = {};

/** No files exist in storage yet — shows the empty-state message. */
export const Empty: Story = {
  args: {
    storedFiles: [],
  },
};
