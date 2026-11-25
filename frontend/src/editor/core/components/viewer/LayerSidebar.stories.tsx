import type { Meta, StoryObj } from "@storybook/react-vite";
import { PDFDocument, PDFName, PDFString, type PDFRef } from "@cantoo/pdf-lib";
import { LayerSidebar } from "@editor/components/viewer/LayerSidebar";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

/** A one-page PDF with three layers, the last switched off by default. */
async function layeredPdf(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const layer = (name: string): PDFRef =>
    doc.context.register(
      doc.context.obj({ Type: "OCG", Name: PDFString.of(name) }),
    );
  const layers = ["Base plan", "Furniture", "Dimensions"].map(layer);
  doc.catalog.set(
    PDFName.of("OCProperties"),
    doc.context.obj({
      OCGs: layers,
      D: { Order: layers, ON: layers.slice(0, 2), OFF: [layers[2]] },
    }),
  );
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

const meta = {
  title: "Viewer/LayerSidebar",
  component: LayerSidebar,
  parameters: { layout: "fullscreen" },
  args: {
    visible: true,
    documentCacheKey: "story-doc",
    onApplyLayers: async () => {},
  },
  decorators: [
    (Story) => (
      <ViewerStoryProviders>
        <div style={{ height: "40rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof LayerSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const WithLayers: Story = {
  loaders: [async () => ({ file: await layeredPdf() })],
  render: (args, { loaded }) => (
    <LayerSidebar {...args} file={loaded.file as Blob} />
  ),
};

/** Layers can be seen but not changed. */
export const ReadOnly: Story = {
  ...WithLayers,
  args: { readOnly: true },
};
