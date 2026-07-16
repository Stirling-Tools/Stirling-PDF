import type { Meta, StoryObj } from "@storybook/react-vite";
import FieldBlock from "@app/components/tools/validateSignature/reportView/FieldBlock";

// FieldBlock is a plain function that returns a JSX element (called directly
// as `FieldBlock(label, value)`), not a React component consumed via JSX
// props, so every story renders it through a `render` override instead of
// `args`.
const meta = {
  title: "Tools/ValidateSignature/ReportView/FieldBlock",
  component: FieldBlock,
} satisfies Meta<typeof FieldBlock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => FieldBlock("Signer Name", "Jane Doe"),
};

export const EmptyValue: Story = {
  render: () => FieldBlock("Reason", ""),
};
