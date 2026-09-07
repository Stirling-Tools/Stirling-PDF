import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TypeSignatureText } from "@app/components/shared/wetSignature/TypeSignatureText";

const meta = {
  title: "Shared/WetSignature/TypeSignatureText",
  component: TypeSignatureText,
  parameters: { layout: "padded" },
  args: {
    text: "Jane Doe",
    fontFamily: "Arial",
    fontSize: 40,
    color: "#000000",
    onTextChange: () => {},
    onFontFamilyChange: () => {},
    onFontSizeChange: () => {},
    onColorChange: () => {},
    onSignatureChange: () => {},
  },
} satisfies Meta<typeof TypeSignatureText>;
export default meta;
type Story = StoryObj<typeof meta>;

function TypeSignatureTextDemo(
  props: Partial<React.ComponentProps<typeof TypeSignatureText>>,
) {
  const [text, setText] = useState(props.text ?? "Jane Doe");
  const [fontFamily, setFontFamily] = useState(props.fontFamily ?? "Arial");
  const [fontSize, setFontSize] = useState(props.fontSize ?? 40);
  const [color, setColor] = useState(props.color ?? "#000000");

  return (
    <TypeSignatureText
      {...props}
      text={text}
      onTextChange={setText}
      fontFamily={fontFamily}
      onFontFamilyChange={setFontFamily}
      fontSize={fontSize}
      onFontSizeChange={setFontSize}
      color={color}
      onColorChange={setColor}
      onSignatureChange={props.onSignatureChange ?? (() => {})}
    />
  );
}

/** Typed signature with text, font, size and colour controls plus a live preview. */
export const Default: Story = {
  render: () => <TypeSignatureTextDemo />,
};

/** No text entered yet, so the preview is hidden. */
export const Empty: Story = {
  render: () => <TypeSignatureTextDemo text="" />,
};

/** All controls disabled, e.g. while the signature is being submitted. */
export const Disabled: Story = {
  render: () => <TypeSignatureTextDemo disabled />,
};
