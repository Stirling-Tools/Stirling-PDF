import type { Meta, StoryObj } from "@storybook/react";
import { MethodBadge, type HttpMethod } from "@shared/components/MethodBadge";

const meta: Meta<typeof MethodBadge> = {
  title: "Primitives/MethodBadge",
  component: MethodBadge,
  parameters: { layout: "centered" },
  args: { method: "POST" },
  argTypes: {
    method: {
      control: "inline-radio",
      options: ["GET", "POST", "PUT", "PATCH", "DELETE"] satisfies HttpMethod[],
    },
  },
};
export default meta;
type Story = StoryObj<typeof MethodBadge>;

export const Default: Story = {};

export const InRow: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <MethodBadge method="POST" />
      <span
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-2)" }}
      >
        /v1/coi
      </span>
    </div>
  ),
};

export const Matrix: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((m) => (
        <MethodBadge key={m} method={m} />
      ))}
    </div>
  ),
};
