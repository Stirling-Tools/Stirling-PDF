import type { Meta, StoryObj } from "@storybook/react-vite";
import KeyValueList from "@app/components/tools/getPdfInfo/shared/KeyValueList";

const meta = {
  title: "Tools/GetPdfInfo/KeyValueList",
  component: KeyValueList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof KeyValueList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
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
    obj: {},
    emptyLabel: "No custom metadata found",
  },
};
