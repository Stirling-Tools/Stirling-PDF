import type { Meta, StoryObj } from "@storybook/react-vite";
import { TooltipContent } from "@app/components/shared/tooltip/TooltipContent";
import type { TooltipTip } from "@app/types/tips";

const meta = {
  title: "Shared/Tooltip/TooltipContent",
  component: TooltipContent,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem", background: "var(--bg-surface)" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof TooltipContent>;
export default meta;
type Story = StoryObj<typeof meta>;

const singleTip: TooltipTip[] = [
  {
    title: "Tip",
    description:
      "Choose a page range before running the split to keep sections in order.",
    bullets: [
      "Ranges use commas, e.g. 1-3,5",
      "Leave blank to include all pages",
    ],
  },
];

const multipleTips: TooltipTip[] = [
  {
    title: "Step 1",
    description: "Select the pages you want to extract.",
  },
  {
    title: "Step 2",
    description: "Confirm the output order matches your expectations.",
    bullets: ["Drag to reorder", "Remove any page with the trash icon"],
  },
];

/** Plain text content with no structured tips. */
export const Default: Story = {
  args: {
    content: "Drag and drop files here, or click to browse your computer.",
  },
};

/** A single tip with a title, description, and bullet list. */
export const SingleTip: Story = {
  args: {
    tips: singleTip,
  },
};

/** Multiple tips rendered as separate sections, each with its own spacing. */
export const MultipleTips: Story = {
  args: {
    tips: multipleTips,
  },
};
