import { useState, type ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import {
  ToolWorkflowProvider,
  useToolWorkflow,
} from "@app/contexts/ToolWorkflowContext";

// ToolSearch is handed `toolRegistry` as a prop, but that registry is only
// ever built by ToolWorkflowContext, so the same provider nesting
// AppProviders.tsx sets up above it is needed here to source a real one.
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

function ToolSearchDemo({
  mode = "filter",
  initialValue = "",
}: {
  mode?: "filter" | "dropdown" | "unstyled";
  initialValue?: string;
}) {
  const { toolRegistry } = useToolWorkflow();
  const [value, setValue] = useState(initialValue);

  return (
    <ToolSearch
      value={value}
      onChange={setValue}
      toolRegistry={toolRegistry}
      mode={mode}
      autoFocus={false}
    />
  );
}

const meta = {
  title: "Tools/ToolPicker/ToolSearch",
  component: ToolSearch,
  decorators: [withProviders],
  args: {
    value: "",
    onChange: () => {},
    toolRegistry: {},
    mode: "filter",
  },
} satisfies Meta<typeof ToolSearch>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Filter mode: plain input, no dropdown, used inline above a tool grid. */
export const Default: Story = {
  render: () => <ToolSearchDemo mode="filter" />,
};

/**
 * Dropdown mode with a query pre-filled. The results panel itself only opens
 * in response to a user typing (internal `dropdownOpen` state), so this
 * renders the closed input — type in it to see the fuzzy-matched list.
 */
export const DropdownMode: Story = {
  render: () => <ToolSearchDemo mode="dropdown" initialValue="merge" />,
};

/** Unstyled mode: bare input with no wrapping container, for embedding elsewhere. */
export const Unstyled: Story = {
  render: () => <ToolSearchDemo mode="unstyled" />,
};
