import type { Meta, StoryObj } from "@storybook/react-vite";
import ShowJSView from "@app/components/tools/showJS/ShowJSView";

const SAMPLE_SCRIPT = `function greet(name) {
  // say hello
  if (!name) {
    return "Hello, stranger!";
  }
  return "Hello, " + name + "!";
}

for (let i = 0; i < 3; i++) {
  console.log(greet("World"));
}
`;

const meta = {
  title: "Tools/ShowJS/ShowJSView",
  component: ShowJSView,
} satisfies Meta<typeof ShowJSView>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: SAMPLE_SCRIPT,
  },
};

export const WithDownload: Story = {
  args: {
    data: {
      scriptText: SAMPLE_SCRIPT,
      downloadUrl: "blob:mock-download-url",
      downloadFilename: "extracted.js",
    },
  },
};

export const Empty: Story = {
  args: {
    data: "",
  },
};
