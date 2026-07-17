import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import ToolRenderer from "@app/components/tools/ToolRenderer";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";

/**
 * ToolWorkflowContext reads the tool registry, preferences, and navigation
 * state, so all three providers must be present above it for ToolRenderer
 * to resolve a tool.
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
  title: "Tools/ToolRenderer",
  component: ToolRenderer,
  decorators: [withProviders],
} satisfies Meta<typeof ToolRenderer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A registered tool with a component renders its lazy-loaded settings UI. */
export const Default: Story = {
  args: {
    selectedToolKey: "compress",
    onPreviewFile: () => {},
    onComplete: () => {},
    onError: () => {},
  },
};

/** An unknown tool key falls back to the "Tool not found" message. */
export const ToolNotFound: Story = {
  args: {
    selectedToolKey: "not-a-real-tool" as Story["args"]["selectedToolKey"],
    onPreviewFile: () => {},
    onComplete: () => {},
    onError: () => {},
  },
};
