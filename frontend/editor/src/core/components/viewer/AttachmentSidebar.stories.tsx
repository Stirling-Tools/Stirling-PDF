/**
 * The viewer's attachments rail: embedded files a PDF carries, each downloadable.
 *
 * The sidebar owns its own fetch. On mount it asks the viewer's attachment
 * bridge for the current document's attachments, and what it shows is that
 * request's outcome: pending, failed, empty, or a list. Two things gate the
 * fetch entirely — the bridge must report attachment support (it polls until it
 * does, so an unsupported viewer sits on that notice), and there must be a
 * document key to fetch for. These stories drive the states from the bridge
 * rather than from props, because that is where the states actually come from.
 *
 * The sidebar is `position: fixed` and offsets itself left of whichever other
 * rails are open, so the stories render full-screen.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PdfAttachmentObject } from "@embedpdf/models";
import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";
import { withToolContexts } from "@app/components/tools/storyFixtures";

const ATTACHMENTS = [
  {
    name: "site-survey.xlsx",
    size: 48_128,
    description: "Measurements taken on site",
  },
  { name: "contract-appendix.pdf", size: 1_204_992 },
  { name: "photos.zip", size: 18_874_368, description: "Progress photographs" },
] as unknown as PdfAttachmentObject[];

/** Never settles, which is what the sidebar shows as "loading". */
const pending = () => new Promise<PdfAttachmentObject[]>(() => {});

function withAttachments(
  getAttachments: () => Promise<PdfAttachmentObject[] | null>,
  hasAttachmentSupport = true,
) {
  return withToolContexts({
    viewer: {
      hasAttachmentSupport: () => hasAttachmentSupport,
      toggleAttachmentSidebar: () => {},
      attachmentActions: {
        getAttachments,
        downloadAttachment: () => {},
        clearAttachments: () => {},
        setLocalAttachments: () => {},
      },
    },
  });
}

const meta: Meta<typeof AttachmentSidebar> = {
  title: "Viewer/AttachmentSidebar",
  component: AttachmentSidebar,
  parameters: { layout: "fullscreen" },
  args: {
    visible: true,
    thumbnailVisible: false,
    bookmarkVisible: false,
    documentCacheKey: "report.pdf#1",
  },
  decorators: [withAttachments(async () => ATTACHMENTS)],
};
export default meta;

type Story = StoryObj<typeof AttachmentSidebar>;

/** A document carrying three attachments. */
export const Default: Story = {};

/** The fetch is still in flight. */
export const Loading: Story = { decorators: [withAttachments(pending)] };

/**
 * The bridge failed. "Document not open" errors are retried silently, so this
 * uses a genuine failure — the one case that surfaces with a retry control.
 */
export const LoadFailed: Story = {
  decorators: [
    withAttachments(async () => {
      throw new Error("Attachment stream could not be read");
    }),
  ],
};

/** A document with no attachments, offering the tool that adds one. */
export const NoAttachments: Story = {
  decorators: [withAttachments(async () => [])],
};

/** No document open, so there is nothing to fetch for. */
export const NoDocument: Story = { args: { documentCacheKey: undefined } };

/** A viewer whose attachment bridge never registers. */
export const UnsupportedViewer: Story = {
  decorators: [withAttachments(async () => ATTACHMENTS, false)],
};

/** Thumbnails and bookmarks are open too, so the rail shifts left of both. */
export const AlongsideOtherSidebars: Story = {
  args: { thumbnailVisible: true, bookmarkVisible: true },
};
