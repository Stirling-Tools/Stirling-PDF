import type { Meta, StoryObj } from "@storybook/react-vite";
import OtherSection from "@app/components/tools/getPdfInfo/sections/OtherSection";
import type { PdfOtherInfo } from "@app/types/getPdfInfo";

const populatedOther: PdfOtherInfo = {
  Attachments: [
    { Name: "invoice.xlsx", Description: "Original invoice", FileSize: 24576 },
  ],
  EmbeddedFiles: [
    {
      Name: "font-data.bin",
      FileSize: 10240,
      MimeType: "application/octet-stream",
      CreationDate: "2026-01-01",
      ModificationDate: "2026-02-01",
    },
  ],
  JavaScript: [{ "JS Name": "AutoPrint", "JS Script Length": 42 }],
  Layers: [{ Name: "Watermark" }],
  StructureTree: [{ Type: "Document" }],
  XMPMetadata: "<x:xmpmeta>...</x:xmpmeta>",
};

const meta = {
  title: "Tools/GetPdfInfo/Sections/OtherSection",
  component: OtherSection,
  parameters: { layout: "padded" },
  args: {
    anchorId: "other",
    other: populatedOther,
  },
} satisfies Meta<typeof OtherSection>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    other: {},
  },
};
