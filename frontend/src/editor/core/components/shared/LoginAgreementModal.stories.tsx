import type { Meta, StoryObj } from "@storybook/react-vite";
import LoginAgreementModal from "@app/components/shared/LoginAgreementModal";

/**
 * Renders nothing by default: the modal only opens after fetching
 * `/api/v1/config/login-disclaimer` and finding it enabled, which requires a
 * live AppConfigProvider/backend. In Storybook (no providers configured) the
 * config stays null, so the effect bails out and the component stays hidden.
 */
const meta: Meta<typeof LoginAgreementModal> = {
  title: "Shared/LoginAgreementModal",
  component: LoginAgreementModal,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
