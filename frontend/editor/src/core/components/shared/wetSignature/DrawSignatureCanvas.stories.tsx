import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DrawSignatureCanvas } from "@app/components/shared/wetSignature/DrawSignatureCanvas";

const meta = {
  title: "Shared/WetSignature/DrawSignatureCanvas",
  component: DrawSignatureCanvas,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DrawSignatureCanvas>;
export default meta;

type Story = StoryObj<typeof meta>;

function DrawSignatureCanvasDemo(
  props: Partial<React.ComponentProps<typeof DrawSignatureCanvas>>,
) {
  const [signature, setSignature] = useState<string | null>(null);

  return (
    <DrawSignatureCanvas
      signature={signature}
      onChange={setSignature}
      {...props}
    />
  );
}

/** Empty canvas ready for the user to draw a signature. */
export const Default: Story = { render: () => <DrawSignatureCanvasDemo /> };

/** Disabled state — drawing and clearing are both blocked. */
export const Disabled: Story = {
  render: () => <DrawSignatureCanvasDemo disabled />,
};
