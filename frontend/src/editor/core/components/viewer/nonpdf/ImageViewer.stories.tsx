import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageViewer } from "@app/components/viewer/nonpdf/ImageViewer";

// 2x2 red PNG, used so the component's URL.createObjectURL(file) has real image bytes to render.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNk+M9QDwAEZ" +
  "AGvRy0PbwAAAABJRU5ErkJggg==";

function makeImageFile(name: string): File {
  const bytes = atob(PNG_BASE64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new File([buffer], name, { type: "image/png" });
}

const meta = {
  title: "Viewer/NonPdf/ImageViewer",
  component: ImageViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ImageViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: makeImageFile("sample.png"),
    fileName: "sample.png",
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", height: "24rem" }}>
        <Story />
      </div>
    ),
  ],
};
