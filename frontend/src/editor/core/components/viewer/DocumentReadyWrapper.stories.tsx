import type { Meta, StoryObj } from "@storybook/react-vite";
import { Center, Text } from "@mantine/core";
import { DocumentReadyWrapper } from "@app/components/viewer/DocumentReadyWrapper";

/**
 * Outside of a live `<EmbedPDF>` tree the document-manager plugin never
 * finishes loading, so this always renders its `fallback` — the same state
 * shown in the real viewer while the PDF engine is still initializing.
 */
const meta = {
  title: "Viewer/DocumentReadyWrapper",
  component: DocumentReadyWrapper,
} satisfies Meta<typeof DocumentReadyWrapper>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    fallback: (
      <Center h="10rem">
        <Text c="dimmed" size="sm">
          Loading document…
        </Text>
      </Center>
    ),
    children: (documentId: string) => <Text>Document ready: {documentId}</Text>,
  },
};

export const NoFallback: Story = {
  args: {
    children: (documentId: string) => <Text>Document ready: {documentId}</Text>,
  },
};
