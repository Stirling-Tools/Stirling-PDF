import type { Meta, StoryObj } from "@storybook/react-vite";
import SummarySection from "@app/components/tools/getPdfInfo/sections/SummarySection";
import type { ParsedPdfSections } from "@app/types/getPdfInfo";

const fullSections: ParsedPdfSections = {
  basicInfo: {
    "Number of pages": 12,
    FileSizeInBytes: 245_760,
    TotalImages: 4,
    Language: "en-US",
  },
  documentInfo: {
    "PDF version": "1.7",
  },
  metadata: {
    Title: "Annual Report 2026",
    Author: "Jane Doe",
    CreationDate: "2026-01-10",
    ModificationDate: "2026-02-01",
  },
  encryption: {
    IsEncrypted: false,
  },
  permissions: {
    Printing: "Allowed",
    Modifying: "Allowed",
    "Extracting Content": "Allowed",
    "Document Assembly": "Allowed",
  },
  summaryData: {
    restrictedPermissionsCount: 0,
    Compliance: [
      { Standard: "pdfa-2b", Compliant: true, Summary: "Passed" },
      { Standard: "pdfua-1", Compliant: false, Summary: "Failed" },
    ],
  },
  other: {
    EmbeddedFiles: [],
    JavaScript: [],
    Layers: [],
  },
  perPage: {
    "Page 1": {
      Fonts: [
        { Name: "Helvetica", IsEmbedded: true },
        { Name: "Arial", IsEmbedded: false },
      ],
      Multimedia: [],
    },
  },
  formFields: {},
  toc: [],
};

const emptySections: ParsedPdfSections = {
  basicInfo: {},
  documentInfo: {},
  metadata: {},
  encryption: {},
  permissions: {},
  summaryData: {},
  other: {},
  perPage: {},
  formFields: {},
  toc: [],
};

const meta = {
  title: "Tools/GetPdfInfo/SummarySection",
  component: SummarySection,
} satisfies Meta<typeof SummarySection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    sections: fullSections,
  },
};

export const Empty: Story = {
  args: {
    sections: emptySections,
  },
};

export const HiddenTitle: Story = {
  args: {
    sections: fullSections,
    hideSectionTitle: true,
  },
};
