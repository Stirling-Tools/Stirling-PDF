import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";

/**
 * Reads/writes bindings via HotkeyContext, which in turn reads the tool
 * registry and selection state off ToolWorkflowContext — matching the
 * provider nesting AppProviders.tsx sets up above it.
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
