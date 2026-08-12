import type { Meta, StoryObj } from "@storybook/react-vite";
import { JsonViewer } from "@app/components/viewer/nonpdf/JsonViewer";

function jsonFile(name: string, contents: string) {
  return new File([contents], name, { type: "application/json" });
}

const meta = {
  title: "Viewer/NonPdf/JsonViewer",
  component: JsonViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof JsonViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: jsonFile(
      "config.json",
      JSON.stringify(
        {
          name: "Stirling PDF",
          version: "2.0.0",
          features: ["merge", "split", "compress"],
          settings: { theme: "dark", locale: "en-US" },
        },
        null,
        2,
      ),
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "24rem", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
};

export const InvalidJson: Story = {
  args: {
    file: jsonFile("broken.json", "{ this is not valid json "),
  },
  decorators: Default.decorators,
};
