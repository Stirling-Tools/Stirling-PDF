/**
 * The right-hand list of a PDF's form fields, used when the form-fill tool
 * itself is not open.
 *
 * The sidebar is a view onto form-fill state: it groups whatever fields were
 * parsed out of the document by the page their first widget sits on, and shows
 * a loading or empty notice when there are none to group. Each card carries the
 * field's type icon, a "req" marker when it is mandatory and its tooltip as a
 * hint; signature and button fields get a card but no input, since neither is
 * fillable from a list. The focused field — set by clicking a widget on the page
 * — is highlighted and scrolled into view.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormFieldSidebar } from "@app/tools/formFill/FormFieldSidebar";
import { withFormFill } from "@app/tools/formFill/storyFixtures";

const meta: Meta<typeof FormFieldSidebar> = {
  title: "Tools/FormFill/FormFieldSidebar",
  component: FormFieldSidebar,
  parameters: { layout: "fullscreen" },
  args: { visible: true, onToggle: () => {} },
  decorators: [withFormFill()],
};
export default meta;

type Story = StoryObj<typeof FormFieldSidebar>;

/** A form spanning two pages, so the list carries a divider for each. */
export const Default: Story = {};

/** A field focused from the page: its card is marked and scrolled to. */
export const ActiveField: Story = {
  decorators: [withFormFill({ activeField: "country" })],
};

/** The document is still being parsed for fields. */
export const Loading: Story = { decorators: [withFormFill({ pending: true })] };

/** A PDF with no form in it at all. */
export const NoFields: Story = { decorators: [withFormFill({ fields: [] })] };
