import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceTypeIcon } from "@portal/components/sources/SourceTypeIcon";

const meta: Meta<typeof SourceTypeIcon> = {
  title: "Portal/Sources/SourceTypeIcon",
  component: SourceTypeIcon,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SourceTypeIcon>;

export const Folder: Story = {
  args: { type: "folder" },
};

export const S3: Story = {
  args: { type: "s3" },
};

export const Editor: Story = {
  args: { type: "editor" },
};

/** Unknown source types fall back to the neutral document glyph. */
export const Unknown: Story = {
  args: { type: "unrecognised" },
};
