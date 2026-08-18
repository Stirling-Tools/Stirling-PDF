import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Tooltip } from "@app/ui/Tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
  argTypes: {
    placement: {
      control: "inline-radio",
      options: ["top", "bottom", "left", "right"],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: "Skipped files were replaced while the run was in progress.",
    children: <Button variant="secondary">Hover me</Button>,
  },
};

/** The common shape: an icon that exists only to carry the explanation. */
export const OnAnIconTrigger: Story = {
  args: {
    content: "Counts every file the run left alone.",
    children: <ActionIcon variant="quiet" aria-label="What is this?" />,
  },
};

export const Placements: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, padding: 48 }}>
      {(["top", "bottom", "left", "right"] as const).map((placement) => (
        <Tooltip key={placement} placement={placement} content={placement}>
          <Button variant="secondary">{placement}</Button>
        </Tooltip>
      ))}
    </div>
  ),
};

/** Keyboard reach: focusing the trigger opens it, and Escape closes it. */
export const OpensOnFocus: Story = {
  args: {
    content: "Reachable without a mouse.",
    children: <Button variant="secondary">Focus me</Button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /focus me/i });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByRole("tooltip")).toBeInTheDocument();
    await expect(trigger).toHaveAttribute("aria-describedby");
  },
};
