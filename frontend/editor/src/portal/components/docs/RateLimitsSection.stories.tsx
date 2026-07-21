import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@portal/mocks/docs";
import { RateLimitsSection } from "@portal/components/docs/RateLimitsSection";
import "@portal/views/DeveloperDocs.css";

const meta: Meta<typeof RateLimitsSection> = {
  title: "Portal/DeveloperDocs/RateLimitsSection",
  component: RateLimitsSection,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RateLimitsSection>;

export const Free: Story = {
  args: { rateLimit: docsContentFor("free").rateLimit },
};

export const Pro: Story = {
  args: { rateLimit: docsContentFor("pro").rateLimit },
};

export const Enterprise: Story = {
  args: { rateLimit: docsContentFor("enterprise").rateLimit },
};
