import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FileDocIcon,
  VARIANT_COLORS,
  type FileDocVariant,
} from "@shared/components/FileDocIcon";

const VARIANTS = Object.keys(VARIANT_COLORS) as FileDocVariant[];

const meta: Meta<typeof FileDocIcon> = {
  title: "Primitives/FileDocIcon",
  component: FileDocIcon,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { variant: "pdf" },
  argTypes: {
    variant: { control: "inline-radio", options: VARIANTS },
    color: { control: "color" },
  },
};
export default meta;
type Story = StoryObj<typeof FileDocIcon>;

export const Pdf: Story = {};

/** Every file-type variant, each in its default brand colour. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      {VARIANTS.map((variant) => (
        <div
          key={variant}
          style={{ display: "grid", justifyItems: "center", gap: 6 }}
        >
          <FileDocIcon variant={variant} />
          <small style={{ color: "var(--text-muted, #71717a)" }}>
            {variant}
          </small>
        </div>
      ))}
    </div>
  ),
};

/** The colour can be overridden to match any surface. */
export const CustomColour: Story = {
  args: { variant: "generic", color: "#2563eb" },
};
