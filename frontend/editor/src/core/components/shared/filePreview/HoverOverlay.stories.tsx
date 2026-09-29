import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import HoverOverlay from "@app/components/shared/filePreview/HoverOverlay";

const meta = {
  title: "Shared/FilePreview/HoverOverlay",
  component: HoverOverlay,
  parameters: { layout: "padded" },
} satisfies Meta<typeof HoverOverlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <Box
        style={{
          width: 160,
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--mantine-color-gray-2)",
          borderRadius: "0.25rem",
        }}
      >
        <Text size="sm">Page thumbnail</Text>
      </Box>
    ),
  },
};
