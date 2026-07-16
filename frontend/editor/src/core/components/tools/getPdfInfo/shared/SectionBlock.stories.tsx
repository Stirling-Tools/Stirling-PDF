import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import SectionBlock from "@app/components/tools/getPdfInfo/shared/SectionBlock";

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
    children: <Text>Title: Sample Document</Text>,
  },
};
