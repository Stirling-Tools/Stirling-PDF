import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "@shared/components/Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { width: "20rem", shape: "text", lines: 1 },
  argTypes: {
    shape: { control: "inline-radio", options: ["text", "rect", "circle"] },
    lines: { control: { type: "number", min: 1, max: 8 } },
    width: { control: "text" },
    height: { control: "text" },
  },
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

/** Flip shape / lines / width / height in controls. */
export const Playground: Story = {};

export const InContext_TableRow: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12rem 1fr 5rem 5rem",
        gap: 12,
        alignItems: "center",
        width: "44rem",
      }}
    >
      <Skeleton />
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  ),
};

export const InContext_ActivityFeed: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "26rem",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          <Skeleton shape="circle" width="2rem" height="2rem" />
          <div style={{ flex: 1 }}>
            <Skeleton lines={2} />
          </div>
        </div>
      ))}
    </div>
  ),
};
