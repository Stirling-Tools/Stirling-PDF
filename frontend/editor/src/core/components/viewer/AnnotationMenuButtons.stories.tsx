import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DeleteButton,
  EditTextButton,
  AttachCommentButton,
  CommentButton,
  LinkButton,
} from "@app/components/viewer/AnnotationMenuButtons";

// This module has no single default-exported component -- it's a set of small
// action-icon buttons shared by the annotation menu. Document each separately.
const meta: Meta = {
  title: "Viewer/AnnotationMenuButtons",
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj;

export const Delete: Story = {
  render: () => <DeleteButton onDelete={() => {}} />,
};

export const EditText: Story = {
  render: () => <EditTextButton onEdit={() => {}} />,
};

export const AttachCommentAdd: Story = {
  render: () => (
    <AttachCommentButton
      isInSidebar={false}
      onView={() => {}}
      onAdd={() => {}}
    />
  ),
};

export const AttachCommentView: Story = {
  render: () => (
    <AttachCommentButton
      isInSidebar={true}
      onView={() => {}}
      onAdd={() => {}}
    />
  ),
};

export const CommentEmpty: Story = {
  render: () => <CommentButton hasContent={false} onClick={() => {}} />,
};

export const CommentWithContent: Story = {
  render: () => <CommentButton hasContent={true} onClick={() => {}} />,
};

export const LinkAdd: Story = {
  render: () => (
    <LinkButton
      firstLinkTarget={null}
      onGoToLink={() => {}}
      onAddLink={() => {}}
    />
  ),
};

export const LinkGoTo: Story = {
  render: () => (
    <LinkButton
      firstLinkTarget={{ type: "uri", uri: "https://example.com" }}
      onGoToLink={() => {}}
      onAddLink={() => {}}
    />
  ),
};
