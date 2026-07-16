import type { Meta, StoryObj } from "@storybook/react-vite";
import SectionBlock from "@app/components/tools/getPdfInfo/shared/SectionBlock";
import KeyValueList from "@app/components/tools/getPdfInfo/shared/KeyValueList";

const meta = {
  title: "Tools/GetPdfInfo/Shared/SectionBlock",
  component: SectionBlock,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SectionBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Document Info",
    anchorId: "document-info",
    children: (
      <KeyValueList
        obj={{
          Title: "Sample Document",
          Author: "Jane Doe",
          "PDF version": "1.7",
          "Number of pages": 12,
        }}
      />
    ),
  },
};
