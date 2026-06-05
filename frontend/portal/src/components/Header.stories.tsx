import type { Meta, StoryObj } from "@storybook/react-vite";
import { Header } from "@portal/components/Header";

const meta: Meta<typeof Header> = {
  title: "Portal/Shell/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
  decorators: [
    (S) => (
      <div style={{ background: "var(--color-bg)" }}>
        <S />
        <div style={{ padding: "1.5rem", color: "var(--color-text-3)" }}>
          Page body would render below the header.
        </div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};

export const FreeTier: Story = { globals: { tier: "free" } };
export const ProTier: Story = { globals: { tier: "pro" } };
export const EnterpriseTier: Story = { globals: { tier: "enterprise" } };
