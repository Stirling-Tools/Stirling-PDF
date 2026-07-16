import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";

const meta = {
  title: "Shared/EncryptedPdfUnlockModal",
  component: EncryptedPdfUnlockModal,
} satisfies Meta<typeof EncryptedPdfUnlockModal>;
export default meta;
type Story = StoryObj<typeof meta>;

function UnlockDemo(
  props: Partial<ComponentProps<typeof EncryptedPdfUnlockModal>>,
) {
  const [password, setPassword] = useState("");
  return (
    <EncryptedPdfUnlockModal
      opened
      fileName="contract-final.pdf"
      password={password}
      errorMessage={null}
      isProcessing={false}
      remainingCount={0}
      onPasswordChange={setPassword}
      onUnlock={() => {}}
      onUnlockAll={() => {}}
      onSkip={() => {}}
      {...props}
    />
  );
}

export const Default: Story = { render: () => <UnlockDemo /> };

export const MultipleFilesRemaining: Story = {
  render: () => <UnlockDemo remainingCount={2} />,
};

export const IncorrectPassword: Story = {
  render: () => (
    <UnlockDemo
      password="wrong-password"
      errorMessage="Incorrect password. Please try again."
    />
  ),
};

export const Processing: Story = {
  render: () => <UnlockDemo password="secret" isProcessing />,
};
