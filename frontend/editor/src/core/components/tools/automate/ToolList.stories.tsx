import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolList from "@app/components/tools/automate/ToolList";
import type { AutomationTool } from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

// Empty registry, like AutomationCreation.stories.tsx: ToolSelector resolves
// `tool.operation` against it, and an unmatched operation falls back to the
// search-input display rather than ToolButton (which needs Hotkey/ToolWorkflow
// context the shared preview doesn't mount).
const emptyToolRegistry: Partial<ToolRegistry> = {};

const configuredTools: AutomationTool[] = [
  {
    id: "step-1",
    operation: "compress",
    name: "Compress",
    configured: true,
    parameters: {},
  },
  {
    id: "step-2",
    operation: "flatten",
    name: "Flatten",
    configured: false,
    parameters: {},
  },
];

const meta = {
  title: "Tools/Automate/ToolList",
  component: ToolList,
  args: {
    toolRegistry: emptyToolRegistry,
    onToolUpdate: () => {},
    onToolRemove: () => {},
    onToolConfigure: () => {},
    onToolAdd: () => {},
    getToolName: (operation: string) => operation,
    getToolDefaultParameters: () => ({}),
  },
} satisfies Meta<typeof ToolList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tools: configuredTools,
  },
};

export const Empty: Story = {
  args: {
    tools: [],
  },
};
