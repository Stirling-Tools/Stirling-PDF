import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";

const meta = {
  title: "Tools/Redact/WordsToRedactInput",
  component: WordsToRedactInput,
  args: {
    wordsToRedact: [],
    onWordsChange: () => {},
  },
} satisfies Meta<typeof WordsToRedactInput>;
export default meta;
type Story = StoryObj<typeof meta>;

function WordsToRedactInputDemo({
  initialWords = [],
  disabled,
}: {
  initialWords?: string[];
  disabled?: boolean;
}) {
  const [words, setWords] = useState<string[]>(initialWords);
  return (
    <WordsToRedactInput
      wordsToRedact={words}
      onWordsChange={setWords}
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <WordsToRedactInputDemo />,
};

export const WithWords: Story = {
  render: () => (
    <WordsToRedactInputDemo initialWords={["Confidential", "Top-Secret"]} />
  ),
};

export const Disabled: Story = {
  render: () => (
    <WordsToRedactInputDemo initialWords={["Confidential"]} disabled />
  ),
};
