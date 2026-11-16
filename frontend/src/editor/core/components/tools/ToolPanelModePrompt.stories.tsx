import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolPanelModePrompt from "@editor/components/tools/ToolPanelModePrompt";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";

/**
 * ToolWorkflowProvider reads navigation and tool-registry state on mount, so
 * NavigationProvider and ToolRegistryProvider must wrap it; PreferencesProvider
 * backs the persisted tool-panel-mode choice.
 */
function withProviders(Story: () => ReactElement) {
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
