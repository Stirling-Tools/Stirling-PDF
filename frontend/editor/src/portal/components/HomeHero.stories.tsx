import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeHero } from "@portal/components/HomeHero";

const meta = {
  title: "Portal/Home/HomeHero",
  component: HomeHero,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeHero>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Pay-as-you-go tier: welcome header + setup checklist until onboarding completes. */
export const Default: Story = {
  args: { tier: "pro" },
};

/** Free tier renders the same welcome-header composition as pro. */
export const FreeTier: Story = {
  args: { tier: "free" },
};

/** Enterprise tier hides the status chips — the procurement deal hero owns the invite step. */
export const EnterpriseTier: Story = {
  args: { tier: "enterprise" },
};
