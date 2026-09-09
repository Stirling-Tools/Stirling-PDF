import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnnotationTypeButtons } from "@app/components/viewer/AnnotationTypeButtons";

const meta = {
  title: "Viewer/AnnotationTypeButtons",
  component: AnnotationTypeButtons,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AnnotationTypeButtons>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  annotation: undefined,
  documentId: "doc-1",
  pageIndex: 0,
  annotationId: "annotation-1",
  menuWidth: 260,
  obj: undefined,
  firstLinkTarget: null,
  hasCommentContent: false,
  isInSidebar: false,
  currentColor: "#000000",
  strokeColor: "#000000",
  fillColor: "#0000ff",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  currentOpacity: 100,
  currentWidth: 2,
  onDelete: () => {},
  onEdit: () => {},
  onColorChange: () => {},
  onOpacityChange: () => {},
  onWidthChange: () => {},
  onPropertiesUpdate: () => {},
  onGoToLink: () => {},
  onAddLink: () => {},
  onAddToSidebar: () => {},
  onViewComment: () => {},
  onCommentColorChange: () => {},
};

export const TextMarkup: Story = {
  args: {
    ...baseArgs,
    annotationType: "textMarkup",
  },
};

export const Ink: Story = {
  args: {
    ...baseArgs,
    annotationType: "ink",
  },
};

export const Comment: Story = {
  args: {
    ...baseArgs,
    annotationType: "comment",
    hasCommentContent: true,
  },
};

export const Shape: Story = {
  args: {
    ...baseArgs,
    annotationType: "shape",
  },
};
