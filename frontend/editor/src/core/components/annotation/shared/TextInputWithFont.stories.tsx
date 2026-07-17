import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextInputWithFont } from "@app/components/annotation/shared/TextInputWithFont";

const meta = {
  title: "Annotation/Shared/TextInputWithFont",
  component: TextInputWithFont,
  parameters: { layout: "padded" },
  args: {
    text: "Confidential",
    onTextChange: () => {},
    fontSize: 24,
    onFontSizeChange: () => {},
    fontFamily: "Helvetica",
    onFontFamilyChange: () => {},
    label: "Text",
    placeholder: "Enter text",
    fontLabel: "Font",
    fontSizeLabel: "Size",
    fontSizePlaceholder: "24",
  },
} satisfies Meta<typeof TextInputWithFont>;
export default meta;
type Story = StoryObj<typeof meta>;

function TextInputWithFontDemo(
  props: Partial<React.ComponentProps<typeof TextInputWithFont>>,
) {
  const [text, setText] = useState(props.text ?? "Confidential");
  const [fontSize, setFontSize] = useState(props.fontSize ?? 24);
  const [fontFamily, setFontFamily] = useState(props.fontFamily ?? "Helvetica");
  const [textColor, setTextColor] = useState(props.textColor ?? "#000000");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
    props.textAlign ?? "left",
  );

  return (
    <TextInputWithFont
      label="Text"
      placeholder="Enter text"
      fontLabel="Font"
      fontSizeLabel="Size"
      fontSizePlaceholder="24"
      colorLabel="Colour"
      {...props}
      text={text}
      onTextChange={setText}
      fontSize={fontSize}
      onFontSizeChange={setFontSize}
      fontFamily={fontFamily}
      onFontFamilyChange={setFontFamily}
      textColor={textColor}
      onTextColorChange={setTextColor}
      textAlign={textAlign}
      onTextAlignChange={setTextAlign}
    />
  );
}

/** Full control set: text, font, size, colour and alignment. */
export const Default: Story = {
  render: () => <TextInputWithFontDemo />,
};

/** Without the colour picker or alignment control, as used where those
 * options don't apply to the annotation tool. */
export const WithoutColorOrAlign: Story = {
  render: () => (
    <TextInputWithFontDemo
      onTextColorChange={undefined}
      onTextAlignChange={undefined}
    />
  ),
};

/** All fields disabled. */
export const Disabled: Story = {
  render: () => <TextInputWithFontDemo disabled />,
};
