import type { Meta, StoryObj } from "@storybook/react-vite";
import AutomationImportModal from "@app/components/tools/automate/AutomationImportModal";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

const emptyToolRegistry: Partial<ToolRegistry> = {};

const meta = {
  title: "Tools/Automate/AutomationImportModal",
  component: AutomationImportModal,
} satisfies Meta<typeof AutomationImportModal>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    toolRegistry: emptyToolRegistry,
    onCancel: () => {},
    onImport: () => {},
  },
};

export const Closed: Story = {
  args: {
    opened: false,
    toolRegistry: emptyToolRegistry,
    onCancel: () => {},
    onImport: () => {},
  },
};
