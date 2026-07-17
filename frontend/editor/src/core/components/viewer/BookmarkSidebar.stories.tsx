import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import { BookmarkSidebar } from "@app/components/viewer/BookmarkSidebar";

// Reads viewer/bookmark state off ViewerContext, plus ToolWorkflowContext and
// FileContext for the "Add bookmark" flow — all three only exist inside the
// full app provider tree, so pull that in rather than stubbing each context.
// Config is supplied inline with fetching disabled so the provider skips its
// network call and blocking-loading gate.
const meta = {
  title: "Viewer/BookmarkSidebar",
  component: BookmarkSidebar,
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
} satisfies Meta<typeof BookmarkSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No document loaded yet, so the sidebar falls back to its unavailable/empty state. */
export const Default: Story = {
  args: {
    visible: true,
    thumbnailVisible: false,
  },
};

/** Docked to the left of an open thumbnail sidebar. */
export const WithThumbnailSidebarOpen: Story = {
  args: {
    visible: true,
    thumbnailVisible: true,
  },
};
