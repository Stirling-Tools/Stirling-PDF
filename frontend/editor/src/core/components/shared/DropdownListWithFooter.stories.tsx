import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@mantine/core";
import DropdownListWithFooter, {
  DropdownItem,
} from "@app/components/shared/DropdownListWithFooter";

const meta: Meta<typeof DropdownListWithFooter> = {
  title: "Shared/DropdownListWithFooter",
  component: DropdownListWithFooter,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DropdownListWithFooter>;

const items: DropdownItem[] = [
  { value: "single", name: "Single page" },
  { value: "facing", name: "Facing pages" },
  { value: "book", name: "Book view" },
  { value: "continuous", name: "Continuous scroll", disabled: true },
];

function SingleSelectDemo() {
  const [value, setValue] = useState("single");
  return (
    <DropdownListWithFooter
      label="Page layout"
      items={items}
      value={value}
      onChange={(v) => setValue(v as string)}
    />
  );
}

function MultiSelectDemo() {
  const [value, setValue] = useState<string[]>(["single"]);
  return (
    <DropdownListWithFooter
      label="Page layouts"
      items={items}
      value={value}
      onChange={(v) => setValue(v as string[])}
      multiSelect
      searchable
      footer={
        <Button
          size="xs"
          variant="subtle"
          fullWidth
          onClick={() => setValue([])}
        >
          Clear selection
        </Button>
      }
    />
  );
}

/** Single-select dropdown with a disabled item. */
export const Default: Story = { render: () => <SingleSelectDemo /> };

/** Multi-select with search box and a footer action. */
export const MultiSelectWithFooter: Story = {
  render: () => <MultiSelectDemo />,
};

/** No items available — empty state message inside the dropdown. */
export const Empty: Story = {
  render: () => {
    return (
      <DropdownListWithFooter
        label="Page layout"
        items={[]}
        value=""
        onChange={() => {}}
      />
    );
  },
};
