import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sidebar } from "@portal/components/Sidebar";

const meta: Meta<typeof Sidebar> = {
  title: "Portal/Shell/Sidebar",
  component: Sidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (S) => (
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: "var(--color-bg)",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

export const FreeTier: Story = { globals: { tier: "free" } };

export const EnterpriseTier: Story = { globals: { tier: "enterprise" } };
