/**
 * The three-column arrangement of the file manager modal on a wide viewport:
 * sources on the left, the search/actions/list stack in the middle, and the
 * selected file's details on the right.
 *
 * The layout takes no props — everything comes from the provider. The search
 * bar and action bar above the list are tied to the Recent source, and the
 * list's scroll height is computed from the modal height and whether any files
 * exist, so the populated and empty cases are laid out differently.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import DesktopLayout from "@app/components/fileManager/DesktopLayout";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const FILES = [
  makeStub("file-1", "quarterly-report.pdf"),
  makeStub("file-2", "invoice-2026-01.pdf"),
  makeStub("file-3", "scan-of-contract.pdf", { size: 18_400_000 }),
];

const meta = {
  title: "FileManager/DesktopLayout",
  component: DesktopLayout,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesktopLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Files present and one of them selected, so the details column is filled in. */
export const Default: Story = {
  decorators: [
    withFileManager({ recentFiles: FILES, activeFileIds: [FILES[0].id] }),
  ],
};

/** First run: the middle column is the empty state and the details are blank. */
export const Empty: Story = {
  decorators: [withFileManager({ recentFiles: [] })],
};

/** With storage on, the middle column gains the filter and bulk cloud actions. */
export const StorageEnabled: Story = {
  decorators: [
    withFileManager({
      recentFiles: FILES,
      activeFileIds: [FILES[0].id],
      config: { storageEnabled: true, storageSharingEnabled: true },
    }),
  ],
};
