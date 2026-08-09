/**
 * The "what next" strip shown after a tool finishes. The list is a fixed set of
 * suggestions with the tool you are already in filtered out, so the interesting
 * variation is which one is current.
 *
 * A suggestion the tool registry knows about gets the registry's own navigation
 * rather than the fallback path — but both produce the same href, differing
 * only in what the click does, so there is no story for it: it would render
 * identically to the default.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import {
  NavigationStateContext,
  type NavigationContextStateValue,
} from "@app/contexts/NavigationContext";
import {
  ToolWorkflowContext,
  ToolWorkflowActionsContext,
  type ToolWorkflowContextValue,
  type ToolWorkflowActionsValue,
} from "@app/contexts/ToolWorkflowContext";

function Harness({ selectedTool = null }: { selectedTool?: string | null }) {
  return (
    <NavigationStateContext.Provider
      value={{ selectedTool } as unknown as NavigationContextStateValue}
    >
      <ToolWorkflowContext.Provider
        value={
          {
            getSelectedTool: () => null,
          } as unknown as ToolWorkflowContextValue
        }
      >
        <ToolWorkflowActionsContext.Provider
          value={
            {
              handleToolSelect: () => {},
            } as unknown as ToolWorkflowActionsValue
          }
        >
          <div style={{ maxWidth: 360 }}>
            <SuggestedToolsSection />
          </div>
        </ToolWorkflowActionsContext.Provider>
      </ToolWorkflowContext.Provider>
    </NavigationStateContext.Provider>
  );
}

const meta: Meta<typeof SuggestedToolsSection> = {
  title: "Tools/Shared/SuggestedToolsSection",
  component: SuggestedToolsSection,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SuggestedToolsSection>;

/** Nothing selected, so every suggestion is offered. */
export const Default: Story = { render: () => <Harness /> };

/** The current tool drops out of its own suggestion list. */
export const CurrentToolExcluded: Story = {
  render: () => <Harness selectedTool="compress" />,
};

/** Narrow column, where the rows have to hold their layout. */
export const Narrow: Story = {
  render: () => (
    <div style={{ width: 220 }}>
      <Harness />
    </div>
  ),
};
