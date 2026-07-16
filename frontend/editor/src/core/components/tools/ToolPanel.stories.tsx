import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import ToolPanel from "@app/components/tools/ToolPanel";

const meta = {
  title: "Tools/ToolPanel",
  component: ToolPanel,
  parameters: { layout: "fullscreen" },
  // ToolPanel reads its tool list/selection from ToolWorkflowContext, which in
  // turn depends on Navigation/ToolRegistry/Preferences/FileContext — the same
  // provider stack the app mounts around it, so stories need the same wrapper.
  // initialConfig + non-blocking bootstrap skip the AppConfig network fetch and
  // its loading gate so children mount immediately (see AppProviders.stories.tsx).
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
} satisfies Meta<typeof ToolPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Compact view (favourites + recommended) with no tool selected yet. */
export const Default: Story = {
  args: {
    allToolsView: false,
    onShowAllTools: () => {},
  },
};

/** Expanded categorised view with search, entered via "View all tools". */
export const AllTools: Story = {
  args: {
    allToolsView: true,
    onShowAllTools: () => {},
  },
};

/** Explicit compact override, independent of the all-tools view state. */
export const Compact: Story = {
  args: {
    allToolsView: false,
    onShowAllTools: () => {},
    compact: true,
  },
};
