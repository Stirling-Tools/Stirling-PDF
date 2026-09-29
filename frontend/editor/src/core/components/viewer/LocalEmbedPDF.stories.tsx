import type { Meta, StoryObj } from "@storybook/react-vite";
import { LocalEmbedPDF } from "@app/components/viewer/LocalEmbedPDF";

const meta = {
  title: "Viewer/LocalEmbedPDF",
  component: LocalEmbedPDF,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LocalEmbedPDF>;
export default meta;

type Story = StoryObj<typeof meta>;

// No file/url supplied — renders the "No PDF provided" empty state without
// touching the pdfium engine or blob URL setup.
export const Empty: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div style={{ height: "40rem", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

// A non-PDF file surfaces the "cannot preview" guard instead of attempting to
// load the pdfium engine.
export const UnsupportedFile: Story = {
  args: {
    file: new File(["not a pdf"], "notes.txt", { type: "text/plain" }),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "40rem", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
