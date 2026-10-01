import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import GroupedFormatDropdown from "@app/components/tools/convert/GroupedFormatDropdown";

const documentOptions = [
  { value: "pdf", label: "PDF", group: "Document" },
  { value: "docx", label: "Word", group: "Document" },
  { value: "odt", label: "OpenDocument", group: "Document" },
  { value: "png", label: "PNG", group: "Image" },
  { value: "jpg", label: "JPEG", group: "Image" },
  { value: "epub", label: "EPUB", group: "Ebook", usesCloud: true },
  { value: "mobi", label: "MOBI", group: "Ebook", usesCloud: true },
  { value: "cbr", label: "CBR", group: "Comic", enabled: false },
];

const meta = {
  title: "Tools/Convert/GroupedFormatDropdown",
  component: GroupedFormatDropdown,
  args: {
    options: documentOptions,
    onChange: () => {},
  },
} satisfies Meta<typeof GroupedFormatDropdown>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the selected format interactive in the canvas.
const GroupedFormatDropdownDemo = (
  props: Partial<React.ComponentProps<typeof GroupedFormatDropdown>>,
) => {
  const [value, setValue] = useState(props.value);

  return (
    <GroupedFormatDropdown
      options={documentOptions}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
};

export const Default: Story = {
  render: () => <GroupedFormatDropdownDemo />,
};

export const Selected: Story = {
  render: () => <GroupedFormatDropdownDemo value="epub" />,
};

export const Disabled: Story = {
  render: () => <GroupedFormatDropdownDemo value="pdf" disabled />,
};
