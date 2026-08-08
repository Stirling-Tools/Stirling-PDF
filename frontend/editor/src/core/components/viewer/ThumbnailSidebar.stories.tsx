/**
 * The page-thumbnail rail beside the viewer. It reads its scroll position and
 * the thumbnail API from ViewerContext, so the fixture supplies those three
 * fields rather than mounting the viewer.
 *
 * With no thumbnail API the rail renders its frame and no pages, which is what
 * these show — real thumbnails need a rendered document.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThumbnailSidebar } from "@app/components/viewer/ThumbnailSidebar";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";

const viewer = {
  getScrollState: () => ({ currentPage: 1, totalPages: 12 }),
  scrollActions: { scrollToPage: () => {} },
  getThumbnailAPI: () => null,
} as unknown as ViewerContextType;

const meta: Meta<typeof ThumbnailSidebar> = {
  title: "Viewer/ThumbnailSidebar",
  component: ThumbnailSidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ViewerContext.Provider value={viewer}>
        <div style={{ height: "26rem", display: "flex" }}>
          <Story />
        </div>
      </ViewerContext.Provider>
    ),
  ],
  args: { visible: true, onToggle: () => {}, activeFileId: "doc-1" },
};
export default meta;

type Story = StoryObj<typeof ThumbnailSidebar>;

export const Visible: Story = {};

/** Collapsed to its toggle. */
export const Hidden: Story = { args: { visible: false } };

/** No document selected yet. */
export const NoActiveFile: Story = { args: { activeFileId: null } };
