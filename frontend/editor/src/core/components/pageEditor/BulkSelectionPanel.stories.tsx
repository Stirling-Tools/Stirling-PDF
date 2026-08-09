import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import BulkSelectionPanel from "@app/components/pageEditor/BulkSelectionPanel";

/** A document of `n` pages in the shape the panel reads. */
const doc = (n: number) => ({
  pages: Array.from({ length: n }, (_, i) => ({
    id: `page-${i + 1}`,
    pageNumber: i + 1,
  })),
});

/**
 * Selecting pages by typing a range rather than clicking thumbnails. The CSV
 * field is the whole point of the panel, so the stories drive it with real
 * state — typing into a static snapshot would prove nothing.
 */
const meta: Meta<typeof BulkSelectionPanel> = {
  title: "PageEditor/BulkSelectionPanel",
  component: BulkSelectionPanel,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof BulkSelectionPanel>;

function Demo({
  initialCsv = "",
  selected = [],
  pages = 24,
}: {
  initialCsv?: string;
  selected?: string[];
  pages?: number;
}) {
  const [csvInput, setCsvInput] = useState(initialCsv);
  return (
    <BulkSelectionPanel
      csvInput={csvInput}
      setCsvInput={setCsvInput}
      selectedPageIds={selected}
      displayDocument={doc(pages)}
      onUpdatePagesFromCSV={() => {}}
    />
  );
}

/** Nothing selected yet. */
export const Empty: Story = { render: () => <Demo /> };

/** A typed range, with the matching pages selected. */
export const WithRange: Story = {
  render: () => (
    <Demo
      initialCsv="1-5"
      selected={["page-1", "page-2", "page-3", "page-4", "page-5"]}
    />
  ),
};

/** A mixed expression — individual pages and ranges together. */
export const MixedExpression: Story = {
  render: () => (
    <Demo initialCsv="1,4-6,12" selected={["page-1", "page-4", "page-12"]} />
  ),
};

/** Every page selected. */
export const AllSelected: Story = {
  render: () => (
    <Demo
      pages={8}
      initialCsv="1-8"
      selected={Array.from({ length: 8 }, (_, i) => `page-${i + 1}`)}
    />
  ),
};

/** A single-page document, where ranges have little to do. */
export const SinglePage: Story = {
  render: () => <Demo pages={1} />,
};

/** A long document, to check the summary stays readable as counts grow. */
export const LongDocument: Story = {
  render: () => (
    <Demo
      pages={480}
      initialCsv="1-200"
      selected={Array.from({ length: 200 }, (_, i) => `page-${i + 1}`)}
    />
  ),
};
