import type { Meta, StoryObj } from "@storybook/react-vite";
import ComplianceSection from "@app/components/tools/getPdfInfo/sections/ComplianceSection";

const meta = {
  title: "Tools/GetPdfInfo/ComplianceSection",
  component: ComplianceSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ComplianceSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    anchorId: "compliance",
    complianceSummary: [
      {
        Standard: "pdfa-2b",
        Compliant: true,
        Summary: "Document conforms to PDF/A-2B requirements",
      },
      {
        Standard: "pdfua-1",
        Compliant: false,
        Summary:
          "Document is missing required tagging structure for accessibility",
      },
    ],
    legacyCompliance: {
      "IsPDF/SECCompliant": true,
    },
  },
};

export const AllPassed: Story = {
  args: {
    anchorId: "compliance-passed",
    complianceSummary: [
      {
        Standard: "pdfa-3b",
        Compliant: true,
        Summary: "Document conforms to PDF/A-3B requirements",
      },
      {
        Standard: "pdfua-1",
        Compliant: true,
        Summary: "Document meets PDF/UA-1 accessibility requirements",
      },
    ],
    legacyCompliance: null,
  },
};

export const Empty: Story = {
  args: {
    anchorId: "compliance-empty",
    complianceSummary: [],
    legacyCompliance: null,
  },
};
