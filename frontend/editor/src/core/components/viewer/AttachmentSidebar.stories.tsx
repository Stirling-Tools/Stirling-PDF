import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";

// Reads useViewer() (toggleAttachmentSidebar, hasAttachmentSupport,
// attachmentActions) and useToolWorkflow() (handleToolSelectForced), both of
// which only exist inside the full app provider tree — pull that in rather
// than stubbing each context. Mirrors AppProviders.stories.tsx's args for
// skipping the AppConfig network fetch and its blocking-loading gate.
//
// No EmbedPDF viewer bridge is mounted in Storybook, so hasAttachmentSupport()
// stays false and the sidebar renders its "unavailable" state regardless of
// documentCacheKey — that's the one state reachable without a live PDF.
const meta = {
  title: "Viewer/AttachmentSidebar",
  component: AttachmentSidebar,
  parameters: { layout: "padded" },
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
} satisfies Meta<typeof AttachmentSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    visible: true,
    thumbnailVisible: false,
    bookmarkVisible: false,
    documentCacheKey: "doc-1",
  },
};

/** With the thumbnail and bookmark sidebars also open, this sidebar shifts left to sit beside them. */
export const WithOtherSidebarsOpen: Story = {
  args: {
    ...Default.args,
    thumbnailVisible: true,
    bookmarkVisible: true,
  },
};
