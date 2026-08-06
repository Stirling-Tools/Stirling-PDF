import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import HotkeysSection from "@editor/components/shared/config/configSections/HotkeysSection";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@editor/contexts/HotkeyContext";

/**
 * HotkeyContext reads the tool registry and selection state off
 * ToolWorkflowContext, so both providers must wrap the story.
 */
function withProviders(Story: () => ReactElement) {
  return (
    <PreferencesProvider>
      <ToolRegistryProvider>
        <NavigationProvider>
          <ToolWorkflowProvider>
            <HotkeyProvider>
              <Story />
            </HotkeyProvider>
          </ToolWorkflowProvider>
        </NavigationProvider>
      </ToolRegistryProvider>
    </PreferencesProvider>
  );
}

const meta = {
  title: "Shared/Config/ConfigSections/HotkeysSection",
  component: HotkeysSection,
  decorators: [withProviders],
} satisfies Meta<typeof HotkeysSection>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Full tool list with default keyboard shortcuts assigned. */
export const Default: Story = {};
