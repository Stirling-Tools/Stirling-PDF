import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnnotationSelectionMenu } from "@app/components/viewer/AnnotationSelectionMenu";

// AnnotationSelectionMenu reads the active document, which defaults to null outside a live EmbedPDF session.
const meta = {
  title: "Viewer/AnnotationSelectionMenu",
  component: AnnotationSelectionMenu,
} satisfies Meta<typeof AnnotationSelectionMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selected: false,
  },
};
