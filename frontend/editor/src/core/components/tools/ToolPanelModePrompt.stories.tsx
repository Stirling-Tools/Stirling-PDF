import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolPanelModePrompt from "@app/components/tools/ToolPanelModePrompt";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";

/**
 * Reads/writes tool panel mode via ToolWorkflowContext and persists the choice
 * via PreferencesContext — matching the provider nesting AppProviders.tsx sets
 * up above it.
 */
function withProviders(Story: () => JSX.Element) {
  return (
    <PreferencesProvider>
      <ToolRegistryProvider>
        <NavigationProvider>
          <ToolWorkflowProvider>
            <Story />
          </ToolWorkflowProvider>
        </NavigationProvider>
      </ToolRegistryProvider>
    </PreferencesProvider>
  );
}

const meta = {
  title: "Tools/ToolPanelModePrompt",
  component: ToolPanelModePrompt,
  decorators: [withProviders],
} satisfies Meta<typeof ToolPanelModePrompt>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Orchestrator controls visibility directly via `forceOpen`. */
export const Default: Story = {
  args: {
    forceOpen: true,
    onComplete: () => {},
  },
};

/** Closed — nothing renders on top of the story canvas. */
export const Closed: Story = {
  args: {
    forceOpen: false,
    onComplete: () => {},
  },
};
