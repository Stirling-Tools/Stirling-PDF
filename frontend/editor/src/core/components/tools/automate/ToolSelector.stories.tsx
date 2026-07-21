import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolSelector from "@app/components/tools/automate/ToolSelector";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

// ToolSelector only mounts ToolButton once a tool is selected or the dropdown
// is opened with matches, and ToolButton needs Hotkey/ToolWorkflow/AppConfig
// context the shared preview doesn't mount. Leaving `selectedValue` unset and
// the registry empty keeps the story on the closed search-input display.
const emptyToolRegistry: Partial<ToolRegistry> = {};

const meta = {
  title: "Tools/Automate/ToolSelector",
  component: ToolSelector,
  args: {
    onSelect: () => {},
    toolRegistry: emptyToolRegistry,
  },
} satisfies Meta<typeof ToolSelector>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Closed search input, showing the default "Add a tool..." placeholder. */
export const Default: Story = {};

/** Custom placeholder text, e.g. when embedded in a different flow. */
export const CustomPlaceholder: Story = {
  args: {
    placeholder: "Choose a step...",
  },
};
