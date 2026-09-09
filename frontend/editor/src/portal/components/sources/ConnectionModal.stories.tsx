import type { Meta, StoryObj } from "@storybook/react-vite";
import type { IntegrationConfig } from "@portal/api/integrations";
import { ConnectionModal } from "@portal/components/sources/ConnectionModal";

const EDIT_CONNECTION: IntegrationConfig = {
  id: 1,
  integrationType: "S3",
  name: "Claims intake bucket",
  scope: "TEAM",
  ownerUserId: null,
  ownerTeamId: 1,
  enabled: true,
  locked: false,
  defaultAccess: "EXPLICIT_ONLY",
  config: {
    bucket: "acme-claims-inbox",
    region: "eu-west-2",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "********",
  },
  canManage: true,
  createdAt: "2026-07-02T09:12:00",
  updatedAt: "2026-07-02T09:12:00",
};

const meta: Meta<typeof ConnectionModal> = {
  title: "Portal/Sources/ConnectionModal",
  component: ConnectionModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    capabilities: { customApi: true },
    onClose: () => {},
    onSaved: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof ConnectionModal>;

/** Creating a new connection starts on the type picker, grouped by category. */
export const Picker: Story = {};

/** A pinned slot (e.g. the S3 field on a source) skips the picker and goes straight to the form. */
export const FixedType: Story = {
  args: { fixedTypeId: "s3" },
};

/** Editing a stored connection reuses the form of the preset it was created from. */
export const Edit: Story = {
  args: { connection: EDIT_CONNECTION },
};
