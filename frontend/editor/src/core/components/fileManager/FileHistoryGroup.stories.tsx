/**
 * The older versions listed beneath a file in the file manager: a count heading
 * and one indented, non-selectable row per superseded version, newest first.
 *
 * The group draws nothing at all unless it is expanded AND at least one history
 * entry survives the filter that drops the leaf file itself — so an expanded
 * group whose only entry is the leaf renders exactly like a collapsed one, and
 * is not given a story of its own.
 *
 * The rows are FileListItem, which reads FileManagerContext and AppConfig, so
 * the shared file-manager fixture stands those up.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileHistoryGroup from "@app/components/fileManager/FileHistoryGroup";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const LEAF = makeStub("report-v4", "quarterly-report.pdf", {
  versionNumber: 4,
  originalFileId: "report",
});

/** Deliberately out of order: the group sorts by version number itself. */
const HISTORY = [
  makeStub("report-v2", "quarterly-report.pdf", {
    versionNumber: 2,
    originalFileId: "report",
    isLeaf: false,
  }),
  LEAF,
  makeStub("report-v3", "quarterly-report.pdf", {
    versionNumber: 3,
    originalFileId: "report",
    isLeaf: false,
  }),
  makeStub("report-v1", "quarterly-report.pdf", {
    versionNumber: 1,
    originalFileId: "report",
    isLeaf: false,
  }),
];

const meta = {
  title: "FileManager/FileHistoryGroup",
  component: FileHistoryGroup,
  parameters: { layout: "fullscreen" },
  args: {
    leafFile: LEAF,
    historyFiles: HISTORY,
    isExpanded: true,
    onDownloadSingle: () => {},
    onFileDoubleClick: () => {},
    onHistoryFileRemove: () => {},
  },
  decorators: [withFileManager({ recentFiles: HISTORY })],
} satisfies Meta<typeof FileHistoryGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Three superseded versions under the current one, newest first. */
export const Default: Story = {};

/** A file processed once: a single earlier version to fall back to. */
export const SingleEarlierVersion: Story = {
  args: { historyFiles: [LEAF, HISTORY[0]] },
};

/** Collapsed, which is how the group sits until the row's menu opens it. */
export const Collapsed: Story = {
  args: { isExpanded: false },
};
