import type { Meta, StoryObj } from "@storybook/react-vite";
import { sourcesFor } from "@portal/mocks/sources";
import { SourcesTable } from "@portal/components/sources/SourcesTable";

const PRO = sourcesFor("pro");

const meta: Meta<typeof SourcesTable> = {
  title: "Portal/Sources/SourcesTable",
  component: SourcesTable,
  parameters: { layout: "padded" },
  args: { sources: PRO, expandedId: null, onRowClick: () => {} },
};
export default meta;
type Story = StoryObj<typeof SourcesTable>;

export const Default: Story = {};

/** A row with an open detail panel rotates its caret. */
export const RowExpanded: Story = {
  args: { expandedId: PRO[1].id },
};

export const Enterprise: Story = {
  args: { sources: sourcesFor("enterprise") },
};
