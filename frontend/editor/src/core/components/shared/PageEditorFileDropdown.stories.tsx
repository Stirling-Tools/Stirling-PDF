/**
 * The workbench control that reports how many files the page editor is showing
 * and opens a menu to change the set. The menu itself lists every file with a
 * colour swatch, a selection checkbox and a drag handle for reordering, plus an
 * entry that opens the files modal.
 *
 * The trigger is what the stories can show: it renders the selected/total
 * counts, and swaps its icon for a spinner while the workbench is switching
 * into the page editor. The menu opens on click, so it is not a separate story.
 */
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageEditorFileDropdown } from "@app/components/shared/PageEditorFileDropdown";
import {
  FilesModalContext,
  type FilesModalContextType,
} from "@app/contexts/FilesModalContext";
import type { FileId } from "@app/types/file";

const FILES = [
  {
    fileId: "file-1" as FileId,
    name: "quarterly-report.pdf",
    isSelected: true,
  },
  {
    fileId: "file-2" as FileId,
    name: "invoice-2026-01.pdf",
    versionNumber: 2,
    isSelected: true,
  },
  {
    fileId: "file-3" as FileId,
    name: "scan-of-contract.pdf",
    isSelected: false,
  },
];

/** Each file's swatch is looked up by id; missing ids fall back to the first colour. */
const FILE_COLOUR_MAP = new Map<string, number>(
  FILES.map((file, index) => [file.fileId as string, index]),
);

/** Matches the workbench segmented control the trigger renders inside. */
const VIEW_OPTION_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const meta = {
  title: "Shared/PageEditorFileDropdown",
  component: PageEditorFileDropdown,
  parameters: { layout: "centered" },
  args: {
    files: FILES,
    onToggleSelection: () => {},
    onReorder: () => {},
    viewOptionStyle: VIEW_OPTION_STYLE,
    fileColorMap: FILE_COLOUR_MAP,
    selectedCount: 2,
    totalCount: 3,
  },
  decorators: [
    (Story) => (
      // Only openFilesModal is read, by the menu's "Add File" row. The real
      // provider reaches FileContext and NavigationContext, so a slice is used.
      <FilesModalContext.Provider
        value={{ openFilesModal: () => {} } as unknown as FilesModalContextType}
      >
        <Story />
      </FilesModalContext.Provider>
    ),
  ],
} satisfies Meta<typeof PageEditorFileDropdown>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Part of the set selected, which is the usual state. */
export const Default: Story = {};

/** Every file selected. */
export const AllSelected: Story = {
  args: { selectedCount: 3 },
};

/** While the workbench switches into the page editor, a spinner takes the icon's place. */
export const Switching: Story = {
  args: { switchingTo: "pageEditor" },
};
