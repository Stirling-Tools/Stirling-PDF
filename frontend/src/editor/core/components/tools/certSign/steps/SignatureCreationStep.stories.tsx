import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureCreationStep } from "@app/components/tools/certSign/steps/SignatureCreationStep";

const meta = {
  title: "CertSign/Steps/SignatureCreationStep",
  component: SignatureCreationStep,
} satisfies Meta<typeof SignatureCreationStep>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    signatureType: "draw",
    onSignatureTypeChange: () => {},
    signature: null,
    onSignatureChange: () => {},
    signatureText: "",
    fontFamily: "Helvetica",
    fontSize: 32,
    textColor: "#000000",
    onSignatureTextChange: () => {},
    onFontFamilyChange: () => {},
    onFontSizeChange: () => {},
    onTextColorChange: () => {},
    onNext: () => {},
  },
};

export const WithSignature: Story = {
  args: {
    ...Default.args,
    signature:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  },
};

export const TypeMode: Story = {
  args: {
    ...Default.args,
    signatureType: "type",
    signatureText: "Jane Doe",
    signature:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
