import type { Meta, StoryObj } from "@storybook/react-vite";
import PageSelectionSyntaxHint from "@app/components/shared/PageSelectionSyntaxHint";

const meta = {
  title: "Shared/PageSelectionSyntaxHint",
  component: PageSelectionSyntaxHint,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageSelectionSyntaxHint>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Valid syntax ("1-3,5") renders nothing — no hint shown. */
export const Default: Story = {
  args: {
    input: "1-3,5",
    maxPages: 10,
  },
};

/** Malformed expression falls back to CSV parsing and shows the panel-style hint. */
export const SyntaxError: Story = {
  args: {
    input: "abc",
    maxPages: 10,
  },
};

/** Same malformed input, compact variant used inline within a tool panel. */
export const CompactSyntaxError: Story = {
  args: {
    input: "abc",
    maxPages: 10,
    variant: "compact",
  },
};
