/**
 * The stacked arrangement of the file manager modal on a narrow viewport: the
 * sources as a horizontal row, the compact file details, then the search bar,
 * action bar and list sharing one panel.
 *
 * As with the desktop layout there are no props — the provider supplies
 * everything. The search and action bars belong to the Recent source, and the
 * list's height is worked back from the modal height, allowing extra room for
 * the details block once a file is selected.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import MobileLayout from "@app/components/fileManager/MobileLayout";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const FILES = [
  makeStub("file-1", "quarterly-report.pdf"),
  makeStub("file-2", "invoice-2026-01.pdf"),
];

const meta = {
  title: "FileManager/MobileLayout",
  component: MobileLayout,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  decorators: [
    (Story) => (
      <div style={{ height: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MobileLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A file selected, so the compact details block sits above the list. */
export const Default: Story = {
  decorators: [
    withFileManager({ recentFiles: FILES, activeFileIds: [FILES[0].id] }),
  ],
};

/** Nothing selected: the details block shrinks and the list takes the room. */
export const NoSelection: Story = {
  decorators: [withFileManager({ recentFiles: FILES })],
};

/** First run, with the empty state filling the list panel. */
export const Empty: Story = {
  decorators: [withFileManager({ recentFiles: [] })],
};
