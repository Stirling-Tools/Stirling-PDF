import type { Meta, StoryObj } from "@storybook/react-vite";
import { OfflineActivationCard } from "@portal/components/editor-admin/OfflineActivationCard";
import "@portal/views/EditorAdmin.css";

const meta: Meta<typeof OfflineActivationCard> = {
  title: "Portal/EditorAdmin/OfflineActivationCard",
  component: OfflineActivationCard,
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
type Story = StoryObj<typeof OfflineActivationCard>;

/** Enterprise: bundle generation is live. */
export const Available: Story = {
  args: { available: true },
};

/** Free / Pro: locked behind an upgrade nudge. */
export const Locked: Story = {
  args: { available: false },
};
