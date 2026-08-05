import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "@app/ui/Logo";

const meta: Meta<typeof Logo> = {
  title: "Brand/Logo",
  component: Logo,
  parameters: { layout: "centered" },
  args: { variant: "iconAndText", orientation: "horizontal" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["iconOnly", "iconAndText", "textOnly"],
    },
    orientation: {
      control: "inline-radio",
      options: ["horizontal", "vertical"],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Logo>;

export const Playground: Story = {};

/** The three variants side by side (toggle Storybook's theme to see the
 *  wordmark track light/dark). */
export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
      <Logo variant="iconOnly" />
      <Logo variant="textOnly" />
      <Logo variant="iconAndText" />
    </div>
  ),
};

/** iconAndText stacked — as used in the workbench empty state. */
export const Stacked: Story = {
  render: () => (
    <Logo
      variant="iconAndText"
      orientation="vertical"
      iconHeight="3.5rem"
      textHeight="1.5rem"
      gap="0.75rem"
    />
  ),
};
