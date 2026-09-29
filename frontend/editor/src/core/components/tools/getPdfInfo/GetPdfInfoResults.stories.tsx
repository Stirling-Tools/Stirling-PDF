import type { Meta, StoryObj } from "@storybook/react-vite";
import GetPdfInfoResults from "@app/components/tools/getPdfInfo/GetPdfInfoResults";
import type { GetPdfInfoOperationHook } from "@app/hooks/tools/getPdfInfo/useGetPdfInfoOperation";
import type { PdfInfoReportEntry } from "@app/types/getPdfInfo";

const mockEntry: PdfInfoReportEntry = {
  fileId: "file-1",
  fileName: "sample.pdf",
  fileSize: 245_760,
  lastModified: Date.now(),
  thumbnailUrl: null,
  data: {},
  error: null,
  summaryGeneratedAt: Date.now(),
};

const baseOperation: GetPdfInfoOperationHook = {
  files: [],
  thumbnails: [],
  isGeneratingThumbnails: false,
  downloadUrl: null,
  downloadFilename: "",
  isLoading: false,
  status: "",
  errorMessage: null,
  progress: null,
  executeOperation: async () => {},
  resetResults: () => {},
  clearError: () => {},
  cancelOperation: () => {},
  undoOperation: async () => {},
  results: [],
};

const meta = {
  title: "Tools/GetPdfInfo/GetPdfInfoResults",
  component: GetPdfInfoResults,
} satisfies Meta<typeof GetPdfInfoResults>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    operation: {
      ...baseOperation,
      results: [mockEntry],
      files: [
        new File([JSON.stringify(mockEntry.data)], "response.json", {
          type: "application/json",
        }),
      ],
    },
    isLoading: false,
    errorMessage: null,
  },
};

export const Loading: Story = {
  args: {
    operation: {
      ...baseOperation,
      results: [],
    },
    isLoading: true,
    errorMessage: null,
  },
};

export const Empty: Story = {
  args: {
    operation: {
      ...baseOperation,
      results: [],
    },
    isLoading: false,
    errorMessage: null,
  },
};

export const PartialError: Story = {
  args: {
    operation: {
      ...baseOperation,
      results: [
        mockEntry,
        {
          ...mockEntry,
          fileId: "file-2",
          fileName: "broken.pdf",
          error: "Could not read file",
        },
      ],
      files: [
        new File([JSON.stringify(mockEntry.data)], "response.json", {
          type: "application/json",
        }),
      ],
    },
    isLoading: false,
    errorMessage: "Some files could not be processed.",
  },
};
