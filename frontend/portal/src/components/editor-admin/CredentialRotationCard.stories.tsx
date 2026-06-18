import type { Meta, StoryObj } from "@storybook/react-vite";
import { CredentialRotationCard } from "@portal/components/editor-admin/CredentialRotationCard";
import "@portal/views/EditorAdmin.css";

const meta: Meta<typeof CredentialRotationCard> = {
  title: "Portal/EditorAdmin/CredentialRotationCard",
  component: CredentialRotationCard,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof CredentialRotationCard>;

export const Default: Story = {
  args: {
    serviceToken: {
      masked: "svc_live_••••••••••••7b21",
      lastRotated: "34 days ago",
    },
  },
};

/** Press "Rotate" in the story to see the post-rotation warning banner. */
export const RecentlyRotated: Story = {
  args: {
    serviceToken: {
      masked: "svc_live_••••••••••••7b21",
      lastRotated: "2 days ago",
    },
  },
};
