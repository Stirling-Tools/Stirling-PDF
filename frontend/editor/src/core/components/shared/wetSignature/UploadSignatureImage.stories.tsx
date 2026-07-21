import type { Meta, StoryObj } from "@storybook/react-vite";
import { UploadSignatureImage } from "@app/components/shared/wetSignature/UploadSignatureImage";

const meta = {
  title: "Shared/WetSignature/UploadSignatureImage",
  component: UploadSignatureImage,
  parameters: { layout: "padded" },
} satisfies Meta<typeof UploadSignatureImage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    signature: null,
    onChange: () => {},
  },
};

export const WithSignature: Story = {
  args: {
    signature:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="10" y="50" font-family="cursive" font-size="32">Jane Doe</text></svg>',
      ),
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    signature: null,
    onChange: () => {},
    disabled: true,
  },
};
