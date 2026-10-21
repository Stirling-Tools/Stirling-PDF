import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageUploader } from "@app/components/annotation/shared/ImageUploader";

const meta = {
  title: "Annotation/Shared/ImageUploader",
  component: ImageUploader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ImageUploader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onImageChange: () => {},
  },
};

export const WithLabelAndHint: Story = {
  args: {
    onImageChange: () => {},
    label: "Signature image",
    hint: "PNG, JPG, or SVG - transparent backgrounds work best",
  },
};

export const WithBackgroundRemoval: Story = {
  args: {
    onImageChange: () => {},
    allowBackgroundRemoval: true,
    onProcessedImageData: () => {},
  },
};

export const Disabled: Story = {
  args: {
    onImageChange: () => {},
    disabled: true,
  },
};
