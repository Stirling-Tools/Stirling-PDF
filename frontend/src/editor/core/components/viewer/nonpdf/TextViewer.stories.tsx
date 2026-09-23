import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextViewer } from "@app/components/viewer/nonpdf/TextViewer";

const meta = {
  title: "Viewer/NonPdf/TextViewer",
  component: TextViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TextViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

const plainTextFile = new File(
  [
    Array.from(
      { length: 20 },
      (_, i) => `Line ${i + 1}: the quick brown fox jumps over the lazy dog.`,
    ).join("\n"),
  ],
  "notes.txt",
  { type: "text/plain" },
);

const markdownFile = new File(
  [
    [
      "# Sample document",
      "",
      "This is a **markdown** file rendered by the text viewer.",
      "",
      "- item one",
      "- item two",
      "",
      "> A blockquote for good measure.",
    ].join("\n"),
  ],
  "README.md",
  { type: "text/markdown" },
);

export const Default: Story = {
  args: {
    file: plainTextFile,
    isMarkdown: false,
  },
};

export const Markdown: Story = {
  args: {
    file: markdownFile,
    isMarkdown: true,
  },
};
