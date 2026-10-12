import type { Meta, StoryObj } from "@storybook/react-vite";
import { HtmlViewer } from "@app/components/viewer/nonpdf/HtmlViewer";

const sampleHtmlFile = new File(
  ["<html><body><h1>Sample document</h1><p>Preview content.</p></body></html>"],
  "sample.html",
  { type: "text/html" },
);

const meta = {
  title: "Viewer/Nonpdf/HtmlViewer",
  component: HtmlViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HtmlViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: sampleHtmlFile,
  },
};
