import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDocIcon } from "@app/components/shared/FileDocIcon";

const meta = {
  title: "Shared/FileDocIcon",
  component: FileDocIcon,
  parameters: { layout: "padded" },
  args: { variant: "pdf" },
} satisfies Meta<typeof FileDocIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: "pdf" },
};

/** All file-type variants, each using its own default accent color. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
      <FileDocIcon variant="pdf" />
      <FileDocIcon variant="spreadsheet" />
      <FileDocIcon variant="doc" />
      <FileDocIcon variant="image" />
      <FileDocIcon variant="archive" />
      <FileDocIcon variant="code" />
      <FileDocIcon variant="generic" />
    </div>
  ),
};

/** Explicit `color` overrides the variant's default accent. */
export const CustomColor: Story = {
  args: { variant: "pdf", color: "#e64980" },
};
