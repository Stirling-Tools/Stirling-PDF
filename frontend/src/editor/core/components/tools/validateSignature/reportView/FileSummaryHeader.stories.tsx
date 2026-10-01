import type { Meta, StoryObj } from "@storybook/react-vite";
import FileSummaryHeader from "@app/components/tools/validateSignature/reportView/FileSummaryHeader";

const meta = {
  title: "Tools/ValidateSignature/ReportView/FileSummaryHeader",
  component: FileSummaryHeader,
  args: {
    fileSize: 2_456_789,
    createdAt: "2026-01-15T09:30:00Z",
    totalSignatures: 2,
    lastSignatureDate: "2026-03-04T14:12:00Z",
  },
} satisfies Meta<typeof FileSummaryHeader>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSignatures: Story = {
  args: {
    totalSignatures: 0,
    lastSignatureDate: null,
  },
};

export const MissingMetadata: Story = {
  args: {
    fileSize: null,
    createdAt: null,
    totalSignatures: 1,
    lastSignatureDate: null,
  },
};
