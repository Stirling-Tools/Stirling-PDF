import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";

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
