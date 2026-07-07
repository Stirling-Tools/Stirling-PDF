import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShareConfigModal } from "@portal/components/integrations/ShareConfigModal";
import type { IntegrationConfig } from "@portal/api/integrations";
import type { Member } from "@portal/api/users";

const CONFIG: IntegrationConfig = {
  id: 101,
  integrationType: "API",
  name: "Billing API",
  scope: "SERVER",
  ownerUserId: null,
  ownerTeamId: null,
  enabled: true,
  locked: false,
  defaultAccess: "ORG_ALL",
  config: { baseUrl: "https://api.billing.acme.com", apiKey: "********" },
  canManage: true,
};

const MEMBERS: Member[] = [
  {
    id: "2",
    name: "Priya Nair",
    email: "priya@acme.com",
    role: "member",
    status: "active",
    lastActive: "8m ago",
    username: "priya",
  },
  {
    id: "3",
    name: "Marcus Webb",
    email: "marcus@acme.com",
    role: "member",
    status: "active",
    lastActive: "1h ago",
    username: "marcus",
  },
];

const meta: Meta<typeof ShareConfigModal> = {
  title: "Portal/Integrations/ShareConfigModal",
  component: ShareConfigModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    config: CONFIG,
    members: MEMBERS,
    onClose: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof ShareConfigModal>;

/** Share a config with people at USE or MANAGE (grants load from the mock API). */
export const Default: Story = {};
