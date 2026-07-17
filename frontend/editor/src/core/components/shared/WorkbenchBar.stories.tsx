import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import WorkbenchBar from "@app/components/shared/WorkbenchBar";

// WorkbenchBar reads from FileContext, ToolWorkflowContext, WorkbenchBarContext,
// NavigationContext and ViewerContext — mount the real provider tree rather than
// stubbing each one individually. Config bootstrap is non-blocking so the story
// doesn't wait on a network fetch.
const meta = {
  title: "Shared/WorkbenchBar",
  component: WorkbenchBar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof WorkbenchBar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentView: "fileEditor",
    setCurrentView: () => {},
    hasFiles: true,
  },
};

export const ViewerView: Story = {
  args: {
    currentView: "viewer",
    setCurrentView: () => {},
    hasFiles: true,
  },
};

export const NoFiles: Story = {
  args: {
    currentView: "fileEditor",
    setCurrentView: () => {},
    hasFiles: false,
  },
};
