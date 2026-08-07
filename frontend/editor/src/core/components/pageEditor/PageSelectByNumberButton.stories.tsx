import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import PageSelectByNumberButton from "@app/components/pageEditor/PageSelectByNumberButton";

const doc = (n: number) => ({
  pages: Array.from({ length: n }, (_, i) => ({
    id: `page-${i + 1}`,
    pageNumber: i + 1,
  })),
});

/**
 * The toolbar affordance that opens bulk page selection. It disables itself
 * when there are no pages to select, so an empty document offers no dead
 * control.
 */
const meta: Meta<typeof PageSelectByNumberButton> = {
  title: "PageEditor/PageSelectByNumberButton",
  component: PageSelectByNumberButton,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof PageSelectByNumberButton>;

function Demo({
  totalPages = 24,
  disabled = false,
  initialCsv = "",
  selected = [],
}: {
  totalPages?: number;
  disabled?: boolean;
  initialCsv?: string;
  selected?: string[];
}) {
  const [csvInput, setCsvInput] = useState(initialCsv);
  return (
    <PageSelectByNumberButton
      disabled={disabled}
      totalPages={totalPages}
      label="Select pages by number"
      csvInput={csvInput}
      setCsvInput={setCsvInput}
      selectedPageIds={selected}
      displayDocument={doc(totalPages)}
      updatePagesFromCSV={() => {}}
    />
  );
}

/** Available — click to open the selection popover. */
export const Default: Story = { render: () => <Demo /> };

/** A selection already in place. */
export const WithSelection: Story = {
  render: () => (
    <Demo initialCsv="2,5-9" selected={["page-2", "page-5", "page-9"]} />
  ),
};

/** Explicitly disabled, e.g. while the document is still loading. */
export const Disabled: Story = { render: () => <Demo disabled /> };

/** No pages: the control disables itself regardless of the `disabled` prop. */
export const NoPages: Story = { render: () => <Demo totalPages={0} /> };

/** A single page — selectable, but ranges have little to do. */
export const SinglePage: Story = { render: () => <Demo totalPages={1} /> };
