/**
 * The labelled rule that separates tool subcategories in the picker. Purely
 * presentational: a label between two hairlines, with the surrounding spacing
 * adjustable by the caller.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SubcategoryHeader from "@app/components/tools/shared/SubcategoryHeader";

const meta: Meta<typeof SubcategoryHeader> = {
  title: "Tools/Shared/SubcategoryHeader",
  component: SubcategoryHeader,
  parameters: { layout: "padded" },
  args: { label: "Page formatting" },
};
export default meta;

type Story = StoryObj<typeof SubcategoryHeader>;

export const Default: Story = {};

/** A long label, where the rules give way rather than the text wrapping. */
export const LongLabel: Story = {
  args: { label: "Security, signing and document verification" },
};

/** Tightened spacing, for a header following another block closely. */
export const TightSpacing: Story = { args: { mt: "0.25rem", mb: 0 } };

/** Several in sequence, which is how the picker actually shows them. */
export const InSequence: Story = {
  render: (args) => (
    <div>
      <SubcategoryHeader {...args} label="Page formatting" />
      <SubcategoryHeader {...args} label="Extraction" />
      <SubcategoryHeader {...args} label="Signing" />
    </div>
  ),
};
