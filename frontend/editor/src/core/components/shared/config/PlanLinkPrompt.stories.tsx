import type { Meta, StoryObj } from "@storybook/react-vite";
import PlanLinkPrompt from "@app/components/shared/config/PlanLinkPrompt";

/**
 * Unlinked state of the Plan & Usage page: a self-hosted instance that hasn't
 * linked a Stirling account yet, so there's no metered usage/billing to mirror.
 */
const meta: Meta<typeof PlanLinkPrompt> = {
  title: "Config/PlanLinkPrompt",
  component: PlanLinkPrompt,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
  args: {
    title: "Link your Stirling account",
    body: "Manual PDF editing is always free. Link this instance to a Stirling account to see metered usage and billing, and to claim your free processing allowance.",
    ctaLabel: "Link Stirling account",
    onLink: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PlanLinkPrompt>;

export const Default: Story = {};
