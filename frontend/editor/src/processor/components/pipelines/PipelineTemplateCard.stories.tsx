import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
} from "@processor/components/policies/storyFixtures";
import { PipelineTemplateCard } from "@processor/components/pipelines/PipelineTemplateCard";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const compliance = POLICY_CATEGORIES.find((c) => c.id === "compliance")!;

const meta: Meta<typeof PipelineTemplateCard> = {
  title: "Processor/Pipelines/PipelineTemplateCard",
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
      category: compliance,
      config: POLICY_CONFIG.compliance,
      policy: null,
    },
  },
};
