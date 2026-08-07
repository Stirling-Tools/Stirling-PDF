import type { Meta, StoryObj } from "@storybook/react-vite";
import ResultsPreview, {
  ReviewFile,
} from "@app/components/tools/shared/ResultsPreview";

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

const files: ReviewFile[] = [
  { file: makeFile("contract-final.pdf", "application/pdf", 245_760) },
  { file: makeFile("scan-001.pdf", "application/pdf", 1_048_576) },
  { file: makeFile("invoice-march.pdf", "application/pdf", 51_200) },
];

const meta = {
  title: "Tools/Shared/ResultsPreview",
  component: ResultsPreview,
} satisfies Meta<typeof ResultsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    files,
  },
};

export const SingleFile: Story = {
  args: {
    files: [files[0]],
  },
};

export const Loading: Story = {
  args: {
    files: [],
    isGeneratingThumbnails: true,
  },
};

export const Empty: Story = {
  args: {
    files: [],
  },
};

/** A 1x1 transparent PNG — enough to fill the thumbnail slot without shipping
 *  a fixture image into the repo. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Several results with thumbnails — the navigation controls appear and wrap. */
export const MultipleFiles: Story = {
  args: {
    files: files.map((f) => ({ ...f, thumbnail: PIXEL })),
  },
};

/** Files present but no thumbnails, so the metadata carries the preview. */
export const NoThumbnails: Story = {
  args: {
    files: files.slice(0, 2),
  },
};

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
        file: makeFile(
          "2026-08-quarterly-consolidated-financial-statements-final-signed.pdf",
          "application/pdf",
          245_760,
        ),
        thumbnail: PIXEL,
      },
    ],
  },
};
