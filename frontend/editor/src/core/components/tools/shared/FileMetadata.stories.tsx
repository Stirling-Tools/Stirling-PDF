import type { Meta, StoryObj } from "@storybook/react-vite";
import FileMetadata from "@app/components/tools/shared/FileMetadata";

const buildFile = (name = "report.pdf", type = "application/pdf"): File =>
  new File(["%PDF-1.4 mock content"], name, {
    type,
    lastModified: new Date("2026-01-15T10:30:00Z").getTime(),
  });

const meta = {
  title: "ToolsShared/FileMetadata",
  component: FileMetadata,
} satisfies Meta<typeof FileMetadata>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: buildFile(),
  },
};

export const UnknownType: Story = {
  args: {
    file: buildFile("data.bin", ""),
  },
};
