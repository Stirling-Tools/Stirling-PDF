import type { Meta, StoryObj } from "@storybook/react-vite";
import GetPdfInfoReportView from "@app/components/tools/getPdfInfo/GetPdfInfoReportView";
import type { PdfInfoReportData } from "@app/types/getPdfInfo";

const filledData: PdfInfoReportData = {
  generatedAt: Date.now(),
  entries: [
    {
      fileId: "file-1",
      fileName: "annual-report.pdf",
      fileSize: 245_760,
      lastModified: Date.now(),
      thumbnailUrl: null,
      error: null,
      data: {
        Metadata: {
          Title: "Annual Report 2025",
          Author: "Stirling PDF",
          Subject: "Financials",
          Keywords: "annual, report, finance",
          Creator: "Stirling PDF",
          Producer: "Stirling PDF",
          CreationDate: "2025-01-15T10:00:00Z",
          ModificationDate: "2025-02-01T08:30:00Z",
        },
        BasicInfo: {
          FileSizeInBytes: 245_760,
          WordCount: 12_400,
          ParagraphCount: 320,
          CharacterCount: 78_000,
          Compression: true,
          CompressionType: "Flate",
          Language: "en-US",
          "Number of pages": 24,
          TotalImages: 6,
        },
        DocumentInfo: {
          "PDF version": "1.7",
          Trapped: "False",
          "Page Mode": "UseOutlines",
        },
        Encryption: {
          IsEncrypted: false,
        },
        Permissions: {
          Printing: "Allowed",
          Modifying: "Not Allowed",
          "Extracting Content": "Allowed",
        },
        Compliancy: {
          "IsPDF/ACompliant": true,
          "PDF/AConformanceLevel": "2B",
        },
        "Bookmarks/Outline/TOC": [
          { Title: "Introduction" },
          { Title: "Financial Summary" },
          { Title: "Appendix" },
        ],
        Other: {
          Attachments: [],
          EmbeddedFiles: [],
          JavaScript: [],
        },
        PerPageInfo: {
          "Page 1": {
            Rotation: 0,
            "Page Orientation": "Portrait",
          },
        },
        SummaryData: {
          encrypted: false,
          restrictedPermissions: ["Modifying"],
          restrictedPermissionsCount: 1,
          Compliance: [
            {
              Standard: "PDF/A",
              Compliant: true,
              Summary: "Fully compliant with PDF/A-2B.",
            },
          ],
        },
      },
      summaryGeneratedAt: Date.now(),
    },
  ],
};

const emptyData: PdfInfoReportData = {
  generatedAt: Date.now(),
  entries: [],
};

const meta = {
  title: "Tools/GetPdfInfo/GetPdfInfoReportView",
  component: GetPdfInfoReportView,
  parameters: { layout: "padded" },
} satisfies Meta<typeof GetPdfInfoReportView>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: filledData,
  },
};

export const NoData: Story = {
  args: {
    data: emptyData,
  },
};
