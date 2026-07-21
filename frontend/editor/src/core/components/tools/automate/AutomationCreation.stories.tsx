import type { Meta, StoryObj } from "@storybook/react-vite";
import AutomationCreation from "@app/components/tools/automate/AutomationCreation";
import { AutomationMode } from "@app/types/automation";
import type { AutomationConfig } from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

const emptyToolRegistry: Partial<ToolRegistry> = {};

const existingAutomation: AutomationConfig = {
  id: "automation-1",
  name: "Weekly Cleanup",
  description: "Compress and flatten incoming PDFs.",
  icon: "CompressIcon",
  operations: [
    { operation: "compress", parameters: {} },
    { operation: "flatten", parameters: {} },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const meta = {
  title: "Tools/Automate/AutomationCreation",
  component: AutomationCreation,
} satisfies Meta<typeof AutomationCreation>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    mode: AutomationMode.CREATE,
    onBack: () => {},
    onComplete: () => {},
    toolRegistry: emptyToolRegistry,
  },
};

export const EditExisting: Story = {
  args: {
    mode: AutomationMode.EDIT,
    existingAutomation,
    onBack: () => {},
    onComplete: () => {},
    toolRegistry: emptyToolRegistry,
  },
};

export const EmbeddedHideMetadata: Story = {
  args: {
    mode: AutomationMode.CREATE,
    hideMetadata: true,
    nameOverride: "Watched Folder Automation",
    onBack: () => {},
    onComplete: () => {},
    onSaveFailed: () => {},
    toolRegistry: emptyToolRegistry,
  },
};
