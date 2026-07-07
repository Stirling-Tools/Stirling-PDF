import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorStatusCard } from "@portal/components/EditorStatusCard";
import { SetupChecklist } from "@portal/components/SetupChecklist";

const meta: Meta<typeof EditorStatusCard> = {
  title: "Portal/Home/EditorStatusCard",
  component: EditorStatusCard,
  parameters: { layout: "padded" },
  globals: { tier: "pro" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EditorStatusCard>;

/** The deployed-Editor status card on its own. */
export const Default: Story = {};

/** As it renders on the subscribed home: the setup checklist attached as the footer. */
export const WithSetupChecklist: Story = {
  args: {
    footer: <SetupChecklist onTryOp={() => console.log("try op")} />,
  },
};
