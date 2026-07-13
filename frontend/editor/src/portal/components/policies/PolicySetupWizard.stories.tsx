import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  decorateForStory,
} from "@portal/components/policies/storyFixtures";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const classification = POLICY_CATEGORIES.find((c) => c.id === "classification")!;

const meta: Meta<typeof PolicySetupWizard> = {
  title: "Portal/Policies/PolicySetupWizard",
  component: PolicySetupWizard,
  parameters: { layout: "fullscreen" },
  // The wizard reads the tool registry (for capability fallback names/icons),
  // so stories must supply the provider the app mounts in PortalApp.
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
  args: {
    onClose: () => {},
    onSubmit: async () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PolicySetupWizard>;

/** First-time setup — seeded from the category's preset tool chain. */
export const Create: Story = {
  args: {
    entry: { category: security, config: POLICY_CONFIG.security, policy: null },
  },
};

/** Editing a configured policy — pre-filled from its saved steps + settings. */
export const Edit: Story = {
  args: {
    entry: {
      category: security,
      config: POLICY_CONFIG.security,
      policy: decorateForStory("security"),
    },
  },
};

/** Classification: the workflow step shows the team label editor, not tool toggles. */
export const Classification: Story = {
  args: {
    entry: {
      category: classification,
      config: POLICY_CONFIG.classification,
      policy: null,
    },
  },
};
