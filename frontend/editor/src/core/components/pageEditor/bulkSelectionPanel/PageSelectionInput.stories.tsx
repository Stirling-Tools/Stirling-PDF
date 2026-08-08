/**
 * The page-selection expression field at the top of the bulk selection panel —
 * a title with a syntax-guide tooltip, an optional "Advanced" switch, and the
 * comma/range input itself.
 *
 * Two things decide what renders. The clear button in the input's right section
 * appears only while the expression is non-empty, and the Advanced switch is
 * present only when the caller passes an `advancedOpened` boolean at all —
 * panels that have no advanced mode omit the prop and get no switch.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import PageSelectionInput from "@app/components/pageEditor/bulkSelectionPanel/PageSelectionInput";

const meta = {
  title: "PageEditor/BulkSelectionPanel/PageSelectionInput",
  component: PageSelectionInput,
  args: {
    csvInput: "",
    setCsvInput: () => {},
    onUpdatePagesFromCSV: () => {},
    onClear: () => {},
  },
} satisfies Meta<typeof PageSelectionInput>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Empty: placeholder syntax only, and no clear affordance to offer yet. */
export const Default: Story = {};

/** A non-empty expression reveals the clear button beside the input. */
export const WithExpression: Story = {
  args: { csvInput: "1,3,5-10" },
};

/** Passing `advancedOpened` adds the Advanced switch to the header row. */
export const WithAdvancedToggle: Story = {
  args: { advancedOpened: false, onToggleAdvanced: () => {} },
};

/** The switch on, as it sits while the advanced panel below is expanded. */
export const AdvancedOpened: Story = {
  args: {
    csvInput: "odd & 1-50",
    advancedOpened: true,
    onToggleAdvanced: () => {},
  },
};
