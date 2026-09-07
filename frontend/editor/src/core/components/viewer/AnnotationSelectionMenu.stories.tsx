import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnnotationSelectionMenu } from "@app/components/viewer/AnnotationSelectionMenu";

// AnnotationSelectionMenu reads the active document from ActiveDocumentContext, which
// defaults to `null` outside of a live EmbedPDF document-manager session (not something the
// shared preview can stub). With no active document it short-circuits and renders nothing,
// so this story only exercises that no-active-document mount path without throwing.
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
