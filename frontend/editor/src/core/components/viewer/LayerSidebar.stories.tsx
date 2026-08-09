/**
 * The viewer's optional-content rail: a PDF's layers, each toggleable, with the
 * change written back into the document after a short debounce.
 *
 * Nothing here is passed in as data. The sidebar reads the layers itself, out of
 * the PDF blob it is handed, so its states are the outcomes of that read: no
 * document to read, a read in flight, and a read that failed. The two remaining
 * outcomes — a layered document and one with no layers — need a real PDF parsed
 * through pdf.js, which a story cannot fabricate, so they are not covered here.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";
import { LayerSidebar } from "@app/components/viewer/LayerSidebar";

const withViewer = (Story: React.ComponentType) => (
  <ViewerContext.Provider
    value={{ toggleLayerSidebar: () => {} } as unknown as ViewerContextType}
  >
    <div style={{ height: "80vh" }}>
      <Story />
    </div>
  </ViewerContext.Provider>
);

/** A blob whose bytes never arrive, holding the read open. */
const stalledFile = {
  arrayBuffer: () => new Promise<ArrayBuffer>(() => {}),
} as unknown as Blob;

/** Not a PDF, so the parse rejects and the sidebar reports the failure. */
const unreadableFile = new Blob(["not a pdf"], { type: "application/pdf" });

const meta: Meta<typeof LayerSidebar> = {
  title: "Viewer/LayerSidebar",
  component: LayerSidebar,
  parameters: { layout: "fullscreen" },
  args: {
    visible: true,
    rightOffset: 0,
    onApplyLayers: async () => {},
    onLayersDetected: () => {},
  },
  decorators: [withViewer],
};
export default meta;

type Story = StoryObj<typeof LayerSidebar>;

/** No document open — there is nothing to read layers from. */
export const NoDocument: Story = {};

/** The PDF is being parsed for optional-content groups. */
export const Loading: Story = {
  args: { file: stalledFile, documentCacheKey: "stalled" },
};

/** The parse failed; the reason is shown rather than an empty list. */
export const LoadFailed: Story = {
  args: { file: unreadableFile, documentCacheKey: "unreadable" },
};
