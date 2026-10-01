import type { Meta, StoryObj } from "@storybook/react-vite";
import KeyValueSection from "@app/components/tools/getPdfInfo/sections/KeyValueSection";

const meta = {
  title: "Tools/GetPdfInfo/KeyValueSection",
  component: KeyValueSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof KeyValueSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Document Info",
    anchorId: "document-info",
    obj: {
      Title: "Sample Document",
      Author: "Jane Doe",
      Producer: "Stirling-PDF",
      CreationDate: "2026-01-15",
    },
  },
};

export const Empty: Story = {
  args: {
    title: "Custom Metadata",
    anchorId: "custom-metadata",
    obj: {},
    emptyLabel: "No custom metadata found",
  },
};
