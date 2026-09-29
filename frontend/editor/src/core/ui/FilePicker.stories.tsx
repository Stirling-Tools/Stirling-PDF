import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilePicker } from "@app/ui/FilePicker";

const meta = {
  title: "Primitives/FilePicker",
  component: FilePicker,
  parameters: { layout: "centered" },
} satisfies Meta<typeof FilePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onChange: () => {},
    children: "Choose file",
  },
};

export const AcceptPdf: Story = {
  args: {
    onChange: () => {},
    accept: "application/pdf",
    children: "Choose PDF",
  },
};

export const Multiple: Story = {
  args: {
    onChange: () => {},
    multiple: true,
    children: "Choose files",
  },
};

export const Disabled: Story = {
  args: {
    onChange: () => {},
    disabled: true,
    children: "Choose file",
  },
};
