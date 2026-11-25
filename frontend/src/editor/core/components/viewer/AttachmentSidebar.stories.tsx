import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PdfAttachmentObject } from "@embedpdf/models";
import { AttachmentSidebar } from "@editor/components/viewer/AttachmentSidebar";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const attachments: PdfAttachmentObject[] = [
  {
    index: 0,
    name: "survey-data.csv",
    description: "",
    mimeType: "text/csv",
    size: 18_432,
    checksum: "a1",
  },
  {
    index: 1,
    name: "elevation.png",
    description: "",
    mimeType: "image/png",
    size: 412_009,
    checksum: "b2",
  },
];

const meta = {
  title: "Viewer/AttachmentSidebar",
  component: AttachmentSidebar,
  parameters: { layout: "fullscreen" },
  args: { visible: true, documentCacheKey: "story-doc" },
} satisfies Meta<typeof AttachmentSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const WithAttachments: Story = {
  decorators: [
    (Story) => (
      <ViewerStoryProviders doc={{ attachments }}>
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
      <ViewerStoryProviders doc={{ attachments: [] }}>
        <div style={{ height: "40rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
};
