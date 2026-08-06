import type { Meta, StoryObj } from "@storybook/react-vite";
import ResultsPreview from "@app/components/tools/shared/ResultsPreview";

/** A 1×1 transparent PNG — enough for the thumbnail slot without shipping a
 *  fixture image into the repo. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const file = (name: string, bytes = 24_000) =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

/** What a tool produced, once it has run: a paged preview with metadata and
 *  navigation between the output files. */
const meta: Meta<typeof ResultsPreview> = {
  title: "Tools/Shared/ResultsPreview",
  component: ResultsPreview,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ResultsPreview>;

/** A single result. */
export const SingleFile: Story = {
  args: {
    files: [{ file: file("contract-2026-rotated.pdf"), thumbnail: PIXEL }],
  },
};

/** Several results — the navigation controls appear and wrap around. */
export const MultipleFiles: Story = {
  args: {
    files: [
      { file: file("invoice-001.pdf"), thumbnail: PIXEL },
      { file: file("invoice-002.pdf", 48_000), thumbnail: PIXEL },
      { file: file("invoice-003.pdf", 96_000), thumbnail: PIXEL },
    ],
  },
};

/** Results are through, but their thumbnails are still rendering. */
export const GeneratingThumbnails: Story = {
  args: {
    files: [{ file: file("scan-batch.pdf") }],
    isGeneratingThumbnails: true,
  },
};

/** Files without thumbnails — the metadata still has to carry the preview. */
export const NoThumbnails: Story = {
  args: {
    files: [
      { file: file("report-q3.pdf") },
      { file: file("report-q4.pdf", 120_000) },
    ],
  },
};

/** Nothing produced. */
export const Empty: Story = { args: { files: [] } };

/** A custom empty message, for tools whose "no results" means something
 *  specific. */
export const CustomEmptyMessage: Story = {
  args: {
    files: [],
    emptyMessage: "No pages matched the redaction pattern.",
  },
};

/** A long filename, to check it truncates rather than widening the panel. */
export const LongFilename: Story = {
  args: {
    files: [
      {
        file: file(
          "2026-08-quarterly-consolidated-financial-statements-final-signed.pdf",
        ),
        thumbnail: PIXEL,
      },
    ],
  },
};
