import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@shared/components/Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Connect agent" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["gradient", "outline", "ghost"],
    },
    accent: {
      control: "inline-radio",
      options: ["blue", "purple", "green", "amber", "red"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Gradient: Story = { args: { variant: "gradient" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };

export const WithTrailingArrow: Story = {
  args: {
    variant: "gradient",
    children: "Build a pipeline",
    trailingIcon: <span aria-hidden>→</span>,
  },
};

export const Loading: Story = { args: { variant: "gradient", loading: true } };
export const Disabled: Story = {
  args: { variant: "gradient", disabled: true },
};

export const AccentMatrix: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {(["gradient", "outline"] as const).flatMap((variant) =>
        (["blue", "purple", "green", "amber", "red"] as const).map((accent) => (
          <Button
            key={`${variant}-${accent}`}
            variant={variant}
            accent={accent}
          >
            {variant} · {accent}
          </Button>
        )),
      )}
    </div>
  ),
};
