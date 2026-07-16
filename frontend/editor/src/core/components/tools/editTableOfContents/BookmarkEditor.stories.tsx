import type { Meta, StoryObj } from "@storybook/react-vite";
import BookmarkEditor from "@app/components/tools/editTableOfContents/BookmarkEditor";
import { createBookmarkNode } from "@app/utils/editTableOfContents";

const meta = {
  title: "Tools/EditTableOfContents/BookmarkEditor",
  component: BookmarkEditor,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BookmarkEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    bookmarks: [
      createBookmarkNode({
        title: "Chapter 1: Introduction",
        pageNumber: 1,
        children: [
          createBookmarkNode({
            title: "Section 1.1: Background",
            pageNumber: 2,
          }),
          createBookmarkNode({ title: "Section 1.2: Scope", pageNumber: 4 }),
        ],
      }),
      createBookmarkNode({ title: "Chapter 2: Methodology", pageNumber: 8 }),
    ],
    onChange: () => {},
  },
};

export const Empty: Story = {
  args: {
    bookmarks: [],
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
