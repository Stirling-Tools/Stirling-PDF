import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookmarkSidebar } from "@editor/components/viewer/BookmarkSidebar";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";
import type { PdfBookmarkObject } from "@embedpdf/models";

const bookmarks: PdfBookmarkObject[] = [
  { title: "Introduction" },
  {
    title: "Site plan",
    children: [{ title: "Ground floor" }, { title: "First floor" }],
  },
  { title: "Appendix" },
];

const meta = {
  title: "Viewer/BookmarkSidebar",
  component: BookmarkSidebar,
  parameters: { layout: "fullscreen" },
  args: { visible: true, documentCacheKey: "story-doc" },
} satisfies Meta<typeof BookmarkSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const WithBookmarks: Story = {
  decorators: [
    (Story) => (
      <ViewerStoryProviders doc={{ bookmarks }}>
        <div style={{ height: "40rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
};

export const Empty: Story = {
  decorators: [
    (Story) => (
      <ViewerStoryProviders doc={{ bookmarks: [] }}>
        <div style={{ height: "40rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
};
