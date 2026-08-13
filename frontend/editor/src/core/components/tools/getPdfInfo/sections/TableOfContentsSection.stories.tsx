import type { Meta, StoryObj } from "@storybook/react-vite";
import TableOfContentsSection from "@app/components/tools/getPdfInfo/sections/TableOfContentsSection";
import type { PdfTocEntry } from "@app/types/getPdfInfo";

const tocArray: PdfTocEntry[] = [
  { Title: "Chapter 1: Introduction" },
  { Title: "Chapter 2: Getting Started" },
  { Title: "Chapter 3: Advanced Topics" },
];

const meta = {
  title: "Tools/GetPdfInfo/TableOfContentsSection",
  component: TableOfContentsSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TableOfContentsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    anchorId: "table-of-contents",
    tocArray,
  },
};

export const Empty: Story = {
  args: {
    anchorId: "table-of-contents-empty",
    tocArray: [],
  },
};
