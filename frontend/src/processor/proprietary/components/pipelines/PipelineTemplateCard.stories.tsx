import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
} from "@portal/components/policies/storyFixtures";
import { PipelineTemplateCard } from "@portal/components/pipelines/PipelineTemplateCard";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const routing = POLICY_CATEGORIES.find((c) => c.id === "routing")!;

const meta: Meta<typeof PipelineTemplateCard> = {
  title: "Portal/Pipelines/PipelineTemplateCard",
  component: PipelineTemplateCard,
  parameters: { layout: "padded" },
  args: { onOpen: () => {} },
};
export default meta;
type Story = StoryObj<typeof PipelineTemplateCard>;

/** An available template — opens the simple guided setup. */
export const Default: Story = {
  args: {
    entry: { category: security, config: POLICY_CONFIG.security, policy: null },
  },
};

/** Setup unavailable (e.g. the AI engine is off) — shown but inert. */
export const Locked: Story = {
  args: {
    entry: { category: security, config: POLICY_CONFIG.security, policy: null },
    locked: true,
    lockedLabel: "Requires AI engine",
  },
};

/** Coming-soon category — locked and inert. */
export const ComingSoon: Story = {
  args: {
    entry: {
      category: routing,
      config: POLICY_CONFIG.routing,
      policy: null,
    },
  },
};
