/**
 * The shared single-line text field: an optional leading icon, the input, and a
 * trailing clear button.
 *
 * The clear button is the only conditional piece — it appears when the value has
 * non-whitespace content, the caller has not opted out via `showClearButton`,
 * and the field is neither disabled nor read-only. Everything else (padding,
 * icon gutter) follows from those same choices, so the stories vary them
 * instead of exposing them as controls.
 *
 * The field is controlled, so each story wraps it in local state — otherwise
 * typing would appear to do nothing.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SearchIcon from "@mui/icons-material/Search";
import {
  TextInput,
  type TextInputProps,
} from "@app/components/shared/TextInput";

function Controlled({ value, onChange: _onChange, ...props }: TextInputProps) {
  const [current, setCurrent] = useState(value);
  return (
    <div style={{ width: "22rem" }}>
      <TextInput {...props} value={current} onChange={setCurrent} />
    </div>
  );
}

const meta = {
  title: "Shared/TextInput",
  component: TextInput,
  parameters: { layout: "padded" },
  args: {
    id: "story-text-input",
    name: "story-text-input",
    value: "",
    onChange: () => {},
    placeholder: "Search files",
    "aria-label": "Search files",
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof TextInput>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Empty and unadorned: placeholder only, and no clear button to show yet. */
export const Default: Story = {};

/** With content, the trailing clear button appears and the input reserves room for it. */
export const WithValue: Story = {
  args: { value: "quarterly report" },
};

/** A leading icon indents the text; the clear button still owns the other end. */
export const WithIcon: Story = {
  args: { value: "invoice", icon: <SearchIcon fontSize="small" /> },
};

/** Callers that own their own reset opt out, leaving the value flush to the edge. */
export const WithoutClearButton: Story = {
  args: { value: "locked in", showClearButton: false },
};

/** Disabled suppresses the clear button and greys the field out. */
export const Disabled: Story = {
  args: { value: "cannot edit", disabled: true },
};

/** Read-only keeps the field's normal appearance but drops the clear button. */
export const ReadOnly: Story = {
  args: { value: "reference value", readOnly: true },
};
