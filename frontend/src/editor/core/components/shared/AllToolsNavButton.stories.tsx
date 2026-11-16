import { useState } from "react";
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AllToolsNavButton from "@editor/components/shared/AllToolsNavButton";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";

/**
 * The button reads/writes tool selection and panel state via ToolWorkflowContext,
 * and derives the home link href from NavigationContext plus the tool registry —
 * all four providers must be present for it to render.
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
