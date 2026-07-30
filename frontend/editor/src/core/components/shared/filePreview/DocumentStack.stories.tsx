import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import DocumentStack from "@app/components/shared/filePreview/DocumentStack";

const meta = {
  title: "Shared/FilePreview/DocumentStack",
  component: DocumentStack,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box style={{ width: 200, height: 260 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof DocumentStack>;

export default meta;
type Story = StoryObj<typeof meta>;

const previewContent = (
  <Box
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: "var(--mantine-color-body)",
      border: "1px solid var(--mantine-color-gray-4)",
    }}
  />
);

export const SingleFile: Story = {
  args: {
    totalFiles: 1,
    children: previewContent,
  },
};

export const TwoFiles: Story = {
  args: {
    totalFiles: 2,
    children: previewContent,
  },
};

export const ManyFiles: Story = {
  args: {
    totalFiles: 5,
    children: previewContent,
  },
};
