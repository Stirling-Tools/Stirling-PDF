import { useState } from "react";
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AllToolsNavButton from "@app/components/shared/AllToolsNavButton";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";

/**
 * Reads/writes tool selection and panel state via ToolWorkflowContext, and the
 * home link href via NavigationContext + the tool registry — matching the
 * provider nesting AppProviders.tsx sets up above it.
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
  title: "Shared/AllToolsNavButton",
  component: AllToolsNavButton,
  decorators: [withProviders],
  args: {
    activeButton: "tools",
    setActiveButton: () => {},
  },
} satisfies Meta<typeof AllToolsNavButton>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Highlighted when it is the active quick-access button. */
export const Default: Story = {
  args: {
    activeButton: "tools",
    setActiveButton: () => {},
  },
};

function InactiveDemo() {
  const [activeButton, setActiveButton] = useState("home");
  return (
    <AllToolsNavButton
      activeButton={activeButton}
      setActiveButton={setActiveButton}
    />
  );
}

/** Not the active button — a different quick-access item is selected. */
export const Inactive: Story = {
  render: () => <InactiveDemo />,
};
