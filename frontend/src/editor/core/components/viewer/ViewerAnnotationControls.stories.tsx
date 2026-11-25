import type { Meta, StoryObj } from "@storybook/react-vite";
import ViewerAnnotationControls from "@editor/components/viewer/ViewerAnnotationControls";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const meta = {
  title: "Viewer/ViewerAnnotationControls",
  component: ViewerAnnotationControls,
  args: { currentView: "viewer" },
  decorators: [
    (Story) => (
      <ViewerStoryProviders>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof ViewerAnnotationControls>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The Redact mode button in the viewer's tool row. */
export const InViewer: Story = {};

/** Redaction works on the viewer's pages only. */
export const OtherView: Story = { args: { currentView: "pageEditor" } };
