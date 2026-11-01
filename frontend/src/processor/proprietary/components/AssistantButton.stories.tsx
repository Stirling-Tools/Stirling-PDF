import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { AssistantButton } from "@processor/components/AssistantButton";
import { useUI } from "@processor/contexts/UIContext";

function ForceOpen() {
  const { openAssistant } = useUI();
  useEffect(() => {
    openAssistant();
  }, [openAssistant]);
  return null;
}

const meta: Meta<typeof AssistantButton> = {
  title: "Portal/Assistant/AssistantButton",
  component: AssistantButton,
};
export default meta;
type Story = StoryObj<typeof AssistantButton>;

export const Closed: Story = {};

export const Open: Story = {
  decorators: [
    (S) => (
      <>
        <ForceOpen />
        <S />
      </>
    ),
  ],
};
