import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolChain from "@app/components/shared/ToolChain";
import { ToolOperation } from "@app/types/file";

function op(toolId: ToolOperation["toolId"], timestamp: number): ToolOperation {
  return { toolId, timestamp };
}

const shortChain: ToolOperation[] = [op("watermark", 1), op("ocr", 2)];

const longChain: ToolOperation[] = [
  op("split", 1),
  op("merge", 2),
  op("watermark", 3),
  op("ocr", 4),
  op("rotate", 5),
];

const meta = {
  title: "Shared/ToolChain",
  component: ToolChain,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolChain>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default text style, short chain (no truncation needed). */
export const Default: Story = {
  args: {
    toolChain: shortChain,
  },
};

/** Text style with a long chain — truncates to first → +N → last, with a tooltip for the full chain. */
export const TextTruncated: Story = {
  args: {
    toolChain: longChain,
    displayStyle: "text",
  },
};

/** Badge style — shows up to 3 badges, with "..." + final badge and a tooltip when longer. */
export const Badges: Story = {
  args: {
    toolChain: longChain,
    displayStyle: "badges",
  },
};

/** Compact style — collapses to a tool count once more than one tool is present. */
export const Compact: Story = {
  args: {
    toolChain: longChain,
    displayStyle: "compact",
  },
};
