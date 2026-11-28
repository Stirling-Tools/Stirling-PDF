import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu } from "@mantine/core";
import { knownA11yIssues } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { OpenInNewWindowMenuItem } from "@editor/components/filesPage/OpenInNewWindowMenuItem";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const mockFile: StirlingFileStub = {
  id: "file-1" as FileId,
  name: "document.pdf",
  type: "application/pdf",
  size: 12345,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
};

/**
 * The item inside an open file kebab menu, where the app always renders it: a
 * menu item outside a Menu throws. Web builds render nothing for it, so the
 * menu keeps a sibling item there.
 */
const meta = {
  title: "FilesPage/OpenInNewWindowMenuItem",
  component: OpenInNewWindowMenuItem,
  // Mantine's open menu puts a focusable div among its items, which every menu
  // in the app shares.
  parameters: knownA11yIssues("aria-required-children"),
  decorators: [
    (Story) => (
      <Menu opened withinPortal={false}>
        <Menu.Target>
          <button type="button">File actions</button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item>Download</Menu.Item>
          <Story />
        </Menu.Dropdown>
      </Menu>
    ),
  ],
} satisfies Meta<typeof OpenInNewWindowMenuItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: mockFile,
  },
};
