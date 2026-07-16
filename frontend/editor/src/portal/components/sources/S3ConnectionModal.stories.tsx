import type { Meta, StoryObj } from "@storybook/react-vite";
import { S3ConnectionModal } from "@portal/components/sources/S3ConnectionModal";
import type { IntegrationConfig } from "@portal/api/integrations";

const EXISTING_CONNECTION: IntegrationConfig = {
  id: 1,
  integrationType: "S3",
  name: "Archive bucket",
  scope: "TEAM",
  ownerUserId: null,
  ownerTeamId: 1,
  enabled: true,
  locked: false,
  defaultAccess: "READ_WRITE",
  config: {
    bucket: "stirling-archive",
    region: "us-east-1",
    endpoint: "",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "••••••••",
  },
  canManage: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const meta: Meta<typeof S3ConnectionModal> = {
  title: "Portal/Sources/S3ConnectionModal",
  component: S3ConnectionModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => console.log("close"),
    onSaved: (connection: IntegrationConfig) =>
      console.log("saved", connection),
  },
};
export default meta;
type Story = StoryObj<typeof S3ConnectionModal>;

export const Create: Story = {};

export const Edit: Story = { args: { connection: EXISTING_CONNECTION } };

export const Closed: Story = { args: { open: false } };
