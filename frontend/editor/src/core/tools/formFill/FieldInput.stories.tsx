/**
 * The widget used for one PDF form field, in both the tool panel and the viewer
 * sidebar.
 *
 * The field's own metadata picks the control: a text field becomes a textarea
 * once it is marked multiline, a listbox becomes a multi-select once it allows
 * more than one choice, and a type the component has no widget for (a signature
 * or push button) falls back to a plain text input. Options carry two parallel
 * arrays — the values stored in the PDF and the labels shown to the user — so
 * the dropdowns below deliberately differ between the two.
 *
 * The widget reads its own value out of the form-fill value store rather than
 * from a prop, so the fixture seeds the store by loading the same field.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldInput } from "@app/tools/formFill/FieldInput";
import { field, withFormFill } from "@app/tools/formFill/storyFixtures";
import type { FormField } from "@app/tools/formFill/types";

const TEXT = field({
  name: "fullName",
  label: "Full name",
  value: "Jordan Blake",
});

const MULTILINE = field({
  name: "address",
  label: "Address",
  multiline: true,
  value: "12 Cathedral Road\nCardiff\nCF11 9LJ",
  tooltip: "Include the postcode",
});

const CHECKBOX = field({
  name: "agreeToTerms",
  label: "I agree to the terms",
  type: "checkbox",
  value: "Yes",
  widgets: [
    { pageIndex: 0, x: 72, y: 300, width: 14, height: 14, exportValue: "Yes" },
  ],
});

const COMBOBOX = field({
  name: "country",
  label: "Country",
  type: "combobox",
  value: "uk",
  options: ["uk", "fr", "de"],
  displayOptions: ["United Kingdom", "France", "Germany"],
});

const LISTBOX = field({
  name: "department",
  label: "Department",
  type: "listbox",
  value: "ops",
  options: ["ops", "legal", "finance"],
  displayOptions: ["Operations", "Legal", "Finance"],
});

const MULTI_LISTBOX = field({
  name: "interests",
  label: "Interests",
  type: "listbox",
  multiSelect: true,
  value: "print,archive",
  options: ["print", "archive", "share"],
  displayOptions: ["Printing", "Archiving", "Sharing"],
});

const RADIO = field({
  name: "delivery",
  label: "Delivery",
  type: "radio",
  value: "1",
  options: ["Post", "Courier", "Collection"],
  widgets: [
    { pageIndex: 0, x: 72, y: 380, width: 14, height: 14, exportValue: "post" },
    {
      pageIndex: 0,
      x: 72,
      y: 400,
      width: 14,
      height: 14,
      exportValue: "courier",
    },
    {
      pageIndex: 0,
      x: 72,
      y: 420,
      width: 14,
      height: 14,
      exportValue: "collection",
    },
  ],
});

const READ_ONLY = field({
  name: "reference",
  label: "Reference number",
  readOnly: true,
  value: "INV-20418",
});

const SIGNATURE = field({
  name: "signature",
  label: "Signature",
  type: "signature",
});

/** Each story mounts the store with only the field it is showing. */
const story = (target: FormField): StoryObj<typeof FieldInput> => ({
  args: { field: target },
  decorators: [withFormFill({ fields: [target] })],
});

const meta: Meta<typeof FieldInput> = {
  title: "Tools/FormFill/FieldInput",
  component: FieldInput,
  parameters: { layout: "padded" },
  args: { field: TEXT, onValueChange: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FieldInput>;

/** A single-line text field. */
export const Text: Story = story(TEXT);

/** Multiline text grows into an auto-sizing textarea. */
export const MultilineText: Story = story(MULTILINE);

/** A checkbox carries its own label, unlike the other widgets. */
export const Checkbox: Story = story(CHECKBOX);

/** A combobox: searchable, clearable, showing display labels. */
export const Combobox: Story = story(COMBOBOX);

/** A single-choice listbox, which renders as the same select. */
export const Listbox: Story = story(LISTBOX);

/** A multi-select listbox stores its choices as one comma-joined value. */
export const MultiSelectListbox: Story = story(MULTI_LISTBOX);

/** Radio widgets become one option each, keyed by widget position. */
export const RadioGroup: Story = story(RADIO);

/** A read-only field is shown but cannot be edited. */
export const ReadOnly: Story = story(READ_ONLY);

/** Signature fields have no widget of their own, so they fall back to text. */
export const UnsupportedType: Story = story(SIGNATURE);
