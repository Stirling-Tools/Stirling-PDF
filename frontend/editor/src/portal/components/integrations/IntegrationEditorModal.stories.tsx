import type { Meta, StoryObj } from "@storybook/react-vite";
import { IntegrationEditorModal } from "@portal/components/integrations/IntegrationEditorModal";
import type { IntegrationConfig } from "@portal/api/integrations";

const CONFIG: IntegrationConfig = {
  id: 1,
  integrationType: "API",
  name: "Billing API",
  scope: "USER",
  ownerUserId: 1,
  ownerTeamId: null,
  enabled: true,
  locked: false,
  defaultAccess: "EXPLICIT_ONLY",
  config: { baseUrl: "https://api.billing.acme.com", apiKey: "********" },
  canManage: true,
};

const meta: Meta<typeof IntegrationEditorModal> = {
  title: "Portal/Integrations/IntegrationEditorModal",
  component: IntegrationEditorModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    config: null,
    onClose: () => {},
    onSaved: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof IntegrationEditorModal>;

/** Create: pick the type, name, scope, and typed fields. */
export const Create: Story = {};

/** Edit: type/scope are fixed; secrets start blank ("keep on save"). */
export const Edit: Story = {
  args: { config: CONFIG },
};
