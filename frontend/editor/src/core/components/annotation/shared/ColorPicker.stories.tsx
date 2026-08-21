import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorPicker } from "@app/components/annotation/shared/ColorPicker";

const meta = {
  title: "Annotation/Shared/ColorPicker",
  component: ColorPicker,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    onClose: () => {},
    selectedColor: "#cc0000",
    onColorChange: () => {},
  },
} satisfies Meta<typeof ColorPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

function ColorPickerDemo(
  props: Partial<React.ComponentProps<typeof ColorPicker>>,
) {
  const [color, setColor] = useState(props.selectedColor ?? "#cc0000");
  const [opacity, setOpacity] = useState(props.opacity ?? 100);
  return (
    <ColorPicker
      isOpen
      onClose={() => {}}
      {...props}
      selectedColor={color}
      onColorChange={setColor}
      opacity={opacity}
      onOpacityChange={setOpacity}
    />
  );
}

/** The base modal: swatches + hex picker, no opacity slider. */
export const Default: Story = {
  render: () => <ColorPickerDemo />,
};

/** With the opacity slider shown, for tools that need translucent fills (e.g. highlight, watermark). */
export const WithOpacity: Story = {
  render: () => <ColorPickerDemo showOpacity />,
};
