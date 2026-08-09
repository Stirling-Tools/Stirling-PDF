/**
 * The strip above a tool's controls telling you whether you have enough files
 * selected. It reads the loaded-file list and the files-modal opener from
 * context, and compares what is selected against the tool's minimum.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileStatusIndicator from "@app/components/tools/shared/FileStatusIndicator";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import type { StirlingFile } from "@app/types/fileContext";

const file = (name: string) => ({ name }) as unknown as StirlingFile;

const meta: Meta<typeof FileStatusIndicator> = {
  title: "Tools/Shared/FileStatusIndicator",
  component: FileStatusIndicator,
  parameters: { layout: "padded" },
  decorators: [withToolContexts()],
};
export default meta;

type Story = StoryObj<typeof FileStatusIndicator>;

/** Nothing selected against a tool needing one file. */
export const NoneSelected: Story = { args: { selectedFiles: [], minFiles: 1 } };

export const OneSelected: Story = {
  args: { selectedFiles: [file("report.pdf")], minFiles: 1 },
};

/** A tool needing two files, with only one to hand. */
export const BelowMinimum: Story = {
  args: { selectedFiles: [file("report.pdf")], minFiles: 2 },
};

export const MinimumMet: Story = {
  args: {
    selectedFiles: [file("report.pdf"), file("appendix.pdf")],
    minFiles: 2,
  },
};

/** Well past the minimum, which is the merge and combine case. */
export const ManySelected: Story = {
  args: {
    selectedFiles: Array.from({ length: 7 }, (_, i) =>
      file(`scan-${String(i + 1).padStart(2, "0")}.pdf`),
    ),
    minFiles: 2,
  },
};
