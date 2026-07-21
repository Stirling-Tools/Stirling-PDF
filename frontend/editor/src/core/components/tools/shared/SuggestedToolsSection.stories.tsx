import type { Meta, StoryObj } from "@storybook/react-vite";
import type React from "react";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { AppProviders } from "@app/components/AppProviders";

// SuggestedToolsSection reads the tool list via useSuggestedTools, which pulls
// from NavigationContext and ToolWorkflowContext — mount the real provider
// tree rather than stubbing each one individually.
function withProviders(Story: () => React.JSX.Element) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <Story />
    </AppProviders>
  );
}

const meta = {
  title: "Tools/Shared/SuggestedToolsSection",
  component: SuggestedToolsSection,
  decorators: [withProviders],
} satisfies Meta<typeof SuggestedToolsSection>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Suggested-tools list with no tool currently selected. */
export const Default: Story = {};
