import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileUploadButton from "@app/components/shared/FileUploadButton";

const meta: Meta<typeof FileUploadButton> = {
  title: "Shared/FileUploadButton",
  component: FileUploadButton,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FileUploadButton>;

function UploadDemo({
  initialFile,
  ...rest
}: {
  initialFile?: File;
  disabled?: boolean;
  accept?: string;
  placeholder?: string;
}) {
  const [file, setFile] = useState<File | undefined>(initialFile);
  return (
    <FileUploadButton
      file={file}
      onChange={(next) => setFile(next ?? undefined)}
      {...rest}
    />
  );
}

/** No file chosen yet — shows the default "Choose File" placeholder. */
export const Default: Story = { render: () => <UploadDemo /> };

/** A file has already been selected — the button shows its name. */
export const WithFileSelected: Story = {
  render: () => (
    <UploadDemo
      initialFile={
        new File(["dummy content"], "document.pdf", { type: "application/pdf" })
      }
    />
  ),
};

/** Disabled state — should still be legible but non-interactive. */
export const Disabled: Story = {
  render: () => <UploadDemo disabled />,
};
