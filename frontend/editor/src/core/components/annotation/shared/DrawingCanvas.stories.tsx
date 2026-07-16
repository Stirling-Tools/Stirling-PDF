import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DrawingCanvas } from "@app/components/annotation/shared/DrawingCanvas";

const meta = {
  title: "Annotation/DrawingCanvas",
  component: DrawingCanvas,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DrawingCanvas>;
export default meta;

type Story = StoryObj<typeof meta>;

function DrawingCanvasDemo(
  props: Partial<React.ComponentProps<typeof DrawingCanvas>>,
) {
  const [penSize, setPenSize] = useState(3);
  const [penSizeInput, setPenSizeInput] = useState("3");

  return (
    <DrawingCanvas
      selectedColor="#000000"
      penSize={penSize}
      penSizeInput={penSizeInput}
      onColorSwatchClick={() => {}}
      onPenSizeChange={(size) => {
        setPenSize(size);
        setPenSizeInput(String(size));
      }}
      onPenSizeInputChange={setPenSizeInput}
      onSignatureDataChange={() => {}}
      {...props}
    />
  );
}

/** Empty canvas preview with the drawing modal closed. */
export const Default: Story = { render: () => <DrawingCanvasDemo /> };

/** Preview disabled — clicking the canvas should not open the modal. */
export const Disabled: Story = {
  render: () => <DrawingCanvasDemo disabled />,
};
