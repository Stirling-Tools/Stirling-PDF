import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThumbnailSidebar } from "@editor/components/viewer/ThumbnailSidebar";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const meta = {
  title: "Viewer/ThumbnailSidebar",
  component: ThumbnailSidebar,
  parameters: { layout: "fullscreen" },
  args: { visible: true, onToggle: () => {} },
  decorators: [
    (Story) => (
      <ViewerStoryProviders doc={{ totalPages: 8, currentPage: 2 }}>
        <div style={{ height: "40rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof ThumbnailSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A narrow strip at the edge; the page in view is marked. */
export const Default: Story = {};

/** Beside an open content panel, which keeps the edge. */
export const BesidePanel: Story = { args: { rightOffsetRem: 15 } };
